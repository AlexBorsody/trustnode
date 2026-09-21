import { NextResponse } from "next/server";
import { bearerToken, supabaseConfigured, supabaseFor } from "@/lib/supabase";
import { parsePack, parseRevision, UUID } from "@/packs/model";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Authorization" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return json({ error: "Pack not found." }, 404);
  if (!supabaseConfigured()) return json({ error: "Source packs need a configured database." }, 503);
  const sb = supabaseFor(bearerToken(req) ?? undefined);
  // Read the installed row shape so migration 003 remains readable before 004
  // adds revision/updated_at. The UI disables owner editing without a revision.
  const { data, error } = await sb.from("tn_packs")
    .select("*,tn_pack_sources(source_id,rank,note,tn_sources(id,title,url,kind,status))")
    .eq("id", id).maybeSingle();
  if (error) return json({ error: "Source packs are unavailable. Check database setup." }, 503);
  if (!data) return json({ error: "Pack not found or private." }, 404);
  data.tn_pack_sources.sort((a: { rank: number }, b: { rank: number }) => a.rank - b.rank);
  const { data: ancestry, error: ancestryError } = await sb.from("tn_pack_origins")
    .select("parent_revision,forked_at,parent:tn_packs!tn_pack_origins_parent_id_fkey(id,title,owner_id)")
    .eq("pack_id", id).maybeSingle();
  // Keep existing installations readable before migration 005. Other read errors
  // must not be misrepresented as successful absence of ancestry.
  const missingAncestry = ancestryError && ["PGRST205", "42P01", "PGRST200"].includes(ancestryError.code);
  if (ancestryError && !missingAncestry) return json({ error: "Could not load pack attribution. Try again." }, 503);
  const origin = ancestry?.parent ? ancestry : null;
  return json({ pack: { ...data, origin, ancestry_available: !missingAncestry } });
}

async function mutate(req: Request, id: string, deleting: boolean) {
  if (!UUID.test(id)) return json({ error: "Pack not found." }, 404);
  const token = bearerToken(req);
  if (!token) return json({ error: "Sign in to manage your pack." }, 401);
  let revision: number;
  let pack: ReturnType<typeof parsePack> | undefined;
  try {
    const input = await req.json();
    revision = parseRevision(input);
    if (!deleting) pack = parsePack(input);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Invalid source pack." }, 400);
  }
  if (!supabaseConfigured()) return json({ error: "Source packs need a configured database." }, 503);
  const sb = supabaseFor(token);
  const { data: auth, error: authError } = await sb.auth.getUser();
  if (authError || !auth.user) return json({ error: "Sign in to manage your pack." }, 401);
  const { data, error } = pack
    ? await sb.rpc("tn_update_pack", {
      p_id: id, p_revision: revision, p_title: pack.title, p_description: pack.description,
      p_category: pack.category, p_tags: pack.tags, p_is_public: pack.is_public, p_entries: pack.entries,
    })
    : await sb.rpc("tn_delete_pack", { p_id: id, p_revision: revision });
  if (error) {
    if (error.code === "PT404") return json({ error: "Pack not found or not owned by your account." }, 404);
    if (error.code === "PT409") return json({ error: "This pack changed in another session. Reload the latest version before saving or deleting. Your draft has not been saved." }, 409);
    if (["23503", "23505", "23514", "42501", "22P02", "22023", "23502"].includes(error.code)) return json({ error: "Choose existing link sources without duplicates and check the pack fields." }, 400);
    return json({ error: "Pack editing is unavailable. Check database setup and try again." }, 503);
  }
  return json(deleting ? { id: data, deleted: true } : { id, revision: data });
}
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return mutate(req, (await params).id, false);
}
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return mutate(req, (await params).id, true);
}
