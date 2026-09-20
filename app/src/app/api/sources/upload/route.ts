import { NextResponse } from "next/server";
import {
  bearerToken,
  slugify,
  supabaseConfigured,
  supabaseFor,
} from "@/lib/supabase";
import { extractText } from "@/trustnode/extract";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: CORS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/html",
  "text/csv",
  "application/json",
]);

async function attachTags(sb: SupabaseClient, sourceId: string, tags: unknown) {
  const list = Array.isArray(tags) ? tags : String(tags ?? "").split(",");
  const slugs = [...new Set(list.map((t) => slugify(String(t))).filter(Boolean))].slice(0, 10);
  for (const slug of slugs) {
    const label =
      list.map((t) => String(t).trim()).find((t) => slugify(t) === slug) ?? slug;
    const { data: tag } = await sb
      .from("tn_tags")
      .upsert({ slug, label }, { onConflict: "slug" })
      .select("id")
      .single();
    if (tag) {
      await sb
        .from("tn_source_tags")
        .upsert(
          { source_id: sourceId, tag_id: (tag as { id: string }).id },
          { onConflict: "source_id,tag_id" },
        );
    }
  }
}

/**
 * POST /api/sources/upload — multipart form: file, title?, category?, tags?,
 * description?. Signed in. Files land in the `source-files` bucket; their
 * bytes are then extracted deterministically (DESIGN §18, BUG-002).
 *
 * Status: `ready` iff extracted_text or a contributor description is present;
 * `pending` if neither; `failed` with a reason if extraction throws and no
 * description carries the source.
 */
export async function POST(req: Request) {
  if (!supabaseConfigured()) {
    return json({ error: "source commons not configured yet" }, 503);
  }
  const token = bearerToken(req) ?? "";
  if (!token) return json({ error: "sign in to contribute" }, 401);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "expected multipart form" }, 400);
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return json({ error: "a file is required" }, 400);
  }
  if (file.size > MAX_BYTES) {
    return json({ error: "file too large (max 25 MB)" }, 400);
  }
  const mime = file.type || "application/octet-stream";
  if (!ALLOWED_MIME.has(mime)) {
    return json(
      { error: "supported files: PDF, text, markdown, HTML, CSV, JSON" },
      400,
    );
  }

  const sb = supabaseFor(token);
  const { data: userData, error: userErr } = await sb.auth.getUser();
  if (userErr || !userData.user) return json({ error: "sign in to contribute" }, 401);
  const user = userData.user;

  const safeName = (form.get("file_name") as string) || file.name || "upload";
  const cleanName = safeName.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
  const storagePath = `${user.id}/${crypto.randomUUID()}-${cleanName}`;

  const { error: upErr } = await sb.storage
    .from("source-files")
    .upload(storagePath, file, { contentType: mime, upsert: false });
  if (upErr) return json({ error: `upload failed: ${upErr.message}` }, 500);

  const title =
    ((form.get("title") as string) ?? "").trim().slice(0, 300) || cleanName;
  const description = ((form.get("description") as string) ?? "").trim().slice(0, 4000);
  const categorySlug = slugify(((form.get("category") as string) ?? "general")) || "general";
  const { data: cat } = await sb
    .from("tn_categories")
    .select("id")
    .eq("slug", categorySlug)
    .single();

  // BUG-002: parse the file bytes deterministically. Extraction is pure —
  // same bytes, same text — and capped at 200KB (DESIGN §18).
  let extractedText: string | null = null;
  let extractError: string | null = null;
  try {
    extractedText = await extractText(new Uint8Array(await file.arrayBuffer()), mime);
    if (!extractedText.trim()) extractedText = null;
  } catch (e) {
    extractError = e instanceof Error ? e.message : "extraction failed";
    extractedText = null;
  }

  const status = extractError && !description
    ? "failed"
    : extractedText || description
      ? "ready"
      : "pending";

  const { data: inserted, error } = await sb
    .from("tn_sources")
    .insert({
      owner_id: user.id,
      kind: "file",
      title,
      file_path: storagePath,
      file_name: cleanName,
      mime_type: mime,
      category_id: (cat as { id: string } | null)?.id ?? null,
      status,
      excerpt: description || null,
      extracted_text: extractedText,
      extract_error: extractError,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    await sb.storage.from("source-files").remove([storagePath]);
    return json({ error: error?.message ?? "insert failed" }, 500);
  }

  const sourceId = (inserted as { id: string }).id;
  await attachTags(sb, sourceId, form.get("tags"));

  return json(
    {
      id: sourceId,
      status,
      extracted_chars: extractedText?.length ?? 0,
      ...(extractError ? { extract_error: extractError } : {}),
    },
    201,
  );
}
