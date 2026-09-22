import { boundedJson } from "@/lib/request-body";
import { sourceTags, sourceWriteError } from "@/sources/write";
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
  | { row: { id: string; kind: string; file_path: string | null } }
  | { error: ReturnType<typeof json> }
> {
  const { data: userData, error: userErr } = await sb.auth.getUser();
  const user = !userErr ? userData.user : null;
  if (!user) return { error: json({ error: "sign in to modify sources" }, 401) };
  const { data: row } = await sb
    .from("tn_sources")
    .select("id, kind, file_path, owner_id")
    .eq("id", id)
    .single();
  const typed = row as {
    id: string;
    kind: string;
    file_path: string | null;
    owner_id: string | null;
  } | null;
  if (!typed || typed.owner_id !== user.id) {
    return { error: json({ error: "source not found" }, 404) };
  }
  return { row: typed };
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
    body = await boundedJson(req) as typeof body;
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
  const { data: auth, error: authError } = await sb.auth.getUser();
  if (authError || !auth.user) return json({ error: "sign in to modify sources" }, 401);
  const updates: Record<string, string | null> = {};
  if (body.title !== undefined) {
    const title = body.title.trim().slice(0, 300);
    if (!title) return json({ error: "title cannot be empty" }, 400);
    updates.title = title;
  }
  if (body.description !== undefined) updates.excerpt = body.description.trim().slice(0, 4000) || null;
  if (body.category !== undefined) updates.category = slugify(body.category) || "general";
  const { data, error } = await sb.rpc("tn_save_source", {
    p_id: id, p_data: updates, p_tags: body.tags === undefined ? null : sourceTags(body.tags),
  });
  if (error || !data) { const failure = sourceWriteError(error ?? {}); return json({ error: failure.error }, failure.status); }
  return json(data);
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
