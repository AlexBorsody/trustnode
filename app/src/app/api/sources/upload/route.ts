import { NextResponse } from "next/server";
import {
  bearerToken,
  slugify,
  supabaseConfigured,
  supabaseFor,
} from "@/lib/supabase";
import { extractText } from "@/trustnode/extract";
import { sourceTags, sourceWriteError } from "@/sources/write";
import { boundedBody } from "@/lib/request-body";

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

const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
]);

/**
 * POST /api/sources/upload — multipart form: file, title?, category?, tags?,
 * description?. Signed in. Files land in the `source-files` bucket; their
 * bytes are then extracted deterministically.
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
    const body = await boundedBody(req, MAX_BYTES + 32_768);
    form = await new Response(Buffer.from(body), { headers: { "Content-Type": req.headers.get("content-type") ?? "" } }).formData();
  } catch {
    return json({ error: "expected multipart form with a file no larger than 4 MB" }, 400);
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return json({ error: "a file is required" }, 400);
  }
  if (file.size > MAX_BYTES) {
    return json({ error: "file too large (max 4 MB)" }, 400);
  }
  const mime = file.type || "application/octet-stream";
  if (!ALLOWED_MIME.has(mime)) {
    return json(
      { error: "supported files: PDF, text, markdown, CSV, JSON" },
      400,
    );
  }

  // Reject file-valued metadata before authentication or storage side effects.
  for (const key of ["file_name", "title", "description", "category", "tags"]) {
    if (form.getAll(key).some((value) => typeof value !== "string")) {
      return json({ error: `${key} must be text` }, 400);
    }
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
  if (upErr) return json({ error: "Could not upload the file. Try again." }, 503);

  const title =
    ((form.get("title") as string) ?? "").trim().slice(0, 300) || cleanName;
  const description = ((form.get("description") as string) ?? "").trim().slice(0, 4000);
  const categorySlug = slugify(((form.get("category") as string) ?? "general")) || "general";

  // Parse the file bytes deterministically, capped at 200 KB of text.
  let extractedText: string | null = null;
  let extractError: string | null = null;
  try {
    extractedText = await extractText(new Uint8Array(await file.arrayBuffer()), mime);
    if (!extractedText.trim()) extractedText = null;
  } catch {
    extractError = "Could not extract text from this file. Add a description or upload a supported file.";
    extractedText = null;
  }

  const { data, error } = await sb.rpc("tn_save_source", {
    p_id: null,
    p_data: { kind: "file", title, file_path: storagePath, file_name: cleanName,
      mime_type: mime, category: categorySlug, excerpt: description || null,
      extracted_text: extractedText, extract_error: extractError },
    p_tags: sourceTags(form.get("tags")),
  });
  if (error || !data) {
    const failure = sourceWriteError(error ?? {});
    // A lost RPC response can follow a committed save. Preserve its backing file
    // unless the database definitively rejected the transaction.
    if (failure.status !== 503) {
      try { await sb.storage.from("source-files").remove([storagePath]); } catch { /* admin cleanup can remove the orphan */ }
    }
    return json({ error: failure.error }, failure.status);
  }

  return json(
    {
      id: data.id,
      status: data.status,
      extracted_chars: extractedText?.length ?? 0,
      ...(extractError ? { extract_error: extractError } : {}),
    },
    201,
  );
}
