import { UUID } from "@/packs/model";
import { NextResponse } from "next/server";
import {
  bearerToken,
  slugify,
  supabaseConfigured,
  supabaseFor,
} from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// DESIGN §8 (Phase 0): the missing update path. PATCH is how a `pending`
// source becomes `ready`; DELETE removes a source the owner no longer wants.
// Both are owner-only — RLS enforces it, and the route double-checks so a
// non-owner gets 404 (existence is not leaked).

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: CORS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

async function requireOwner(
  sb: SupabaseClient,
  id: string,
): Promise<
  | { row: { id: string; kind: string; file_path: string | null; excerpt: string | null; extracted_text: string | null } }
  | { error: ReturnType<typeof json> }
> {
  const { data: userData, error: userErr } = await sb.auth.getUser();
  const user = !userErr ? userData.user : null;
  if (!user) return { error: json({ error: "sign in to modify sources" }, 401) };
  const { data: row } = await sb
    .from("tn_sources")
    .select("id, kind, file_path, excerpt, extracted_text, owner_id")
    .eq("id", id)
    .single();
  const typed = row as {
    id: string;
    kind: string;
    file_path: string | null;
    excerpt: string | null;
    extracted_text: string | null;
    owner_id: string | null;
  } | null;
  if (!typed || typed.owner_id !== user.id) {
    return { error: json({ error: "source not found" }, 404) };
  }
  return { row: typed };
}

async function resolveCategoryId(
  sb: SupabaseClient,
  slug: unknown,
): Promise<string | null> {
  const s = slugify(String(slug ?? "general")) || "general";
  const { data } = await sb.from("tn_categories").select("id").eq("slug", s).single();
  return (data as { id: string } | null)?.id ?? null;
}

async function replaceTags(sb: SupabaseClient, sourceId: string, tags: unknown) {
  await sb.from("tn_source_tags").delete().eq("source_id", sourceId);
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

// ---------------------------------------------------------------------------
// PATCH /api/sources/:id — owner edits title/description/category/tags.
// Status is re-derived: `ready` iff an excerpt or extracted text is present,
// so adding a description is what promotes a `pending` source to `ready`.
// ---------------------------------------------------------------------------

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!supabaseConfigured()) {
    return json({ error: "source commons not configured yet" }, 503);
  }
  const { id } = await params;
  if (!UUID.test(id)) return json({ error: "source not found" }, 404);
  const token = bearerToken(req);
  if (!token) return json({ error: "sign in to modify sources" }, 401);

  let body: {
    title?: string;
    description?: string;
    category?: string;
    tags?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "expected JSON body" }, 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body) ||
      ["title", "description", "category"].some(key => {
        const value = (body as Record<string, unknown>)[key];
        return value !== undefined && typeof value !== "string";
      }) || (body.tags !== undefined && typeof body.tags !== "string" && (!Array.isArray(body.tags) || body.tags.some(tag => typeof tag !== "string")))) {
    return json({ error: "Source details must contain valid text fields." }, 400);
  }
  const sb = supabaseFor(token);
  const owned = await requireOwner(sb, id);
  if ("error" in owned) return owned.error;

  const updates: Record<string, string | null> = {};
  if (body.title !== undefined) {
    const title = body.title.trim().slice(0, 300);
    if (!title) return json({ error: "title cannot be empty" }, 400);
    updates.title = title;
  }
  if (body.description !== undefined) {
    updates.excerpt = body.description.trim().slice(0, 4000) || null;
  }
  if (body.category !== undefined) {
    updates.category_id = await resolveCategoryId(sb, body.category);
  }

  const excerpt = updates.excerpt !== undefined ? updates.excerpt : owned.row.excerpt;
  updates.status =
    excerpt || owned.row.extracted_text ? "ready" : "pending";

  const { error } = await sb.from("tn_sources").update(updates).eq("id", id);
  if (error) return json({ error: error.message }, 500);

  if (body.tags !== undefined) {
    await replaceTags(sb, id, body.tags);
  }

  return json({ id, status: updates.status });
}

// ---------------------------------------------------------------------------
// DELETE /api/sources/:id — owner only. Removes the row and, for files,
// the storage object (tag joins cascade).
// ---------------------------------------------------------------------------

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!supabaseConfigured()) {
    return json({ error: "source commons not configured yet" }, 503);
  }
  const { id } = await params;
  if (!UUID.test(id)) return json({ error: "source not found" }, 404);
  const token = bearerToken(req);
  if (!token) return json({ error: "sign in to modify sources" }, 401);

  const sb = supabaseFor(token);
  const owned = await requireOwner(sb, id);
  if ("error" in owned) return owned.error;

  // A pack reference may reject deletion. Preserve its storage object until the
  // source row is actually removed, so a failed delete never breaks a shared file.
  const { error } = await sb.from("tn_sources").delete().eq("id", id);
  if (error?.code === "23503") return json({ error: "This source is used by a pack and cannot be deleted. Its details can still be edited." }, 409);
  if (error) return json({ error: "Could not delete the source. Try again." }, 500);

  if (owned.row.kind === "file" && owned.row.file_path) {
    try {
      const { error: storageError } = await sb.storage.from("source-files").remove([owned.row.file_path]);
      if (storageError) return json({ id, deleted: true, warning: "Source removed from the shelf, but file cleanup needs administrator attention." });
    } catch {
      return json({ id, deleted: true, warning: "Source removed from the shelf, but file cleanup needs administrator attention." });
    }
  }
  return json({ id, deleted: true });
}
