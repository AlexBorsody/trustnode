import { NextResponse } from "next/server";
import { bearerToken, supabaseConfigured, supabaseFor } from "@/lib/supabase";
import { parsePack, parseForkOrigin } from "@/packs/model";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Authorization" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });
export async function GET(req: Request) {
  if (!supabaseConfigured()) return json({ error: "Source packs need a configured database." }, 503);
  const sb = supabaseFor(bearerToken(req) ?? undefined);
  const { data, error } = await sb.from("tn_packs").select("id,title,description,category,tags,is_public,owner_id,created_at")
    .order("created_at", { ascending: false }).limit(50);
  if (error) return json({ error: "Source packs are unavailable. Check database setup." }, 503);
  return json({ packs: data });
}
export async function POST(req: Request) {
  if (!supabaseConfigured()) return json({ error: "Source packs need a configured database." }, 503);
  const token = bearerToken(req);
  if (!token) return json({ error: "Sign in to create a pack." }, 401);
  let body, origin;
  try {
    const input = await req.json();
    body = parsePack(input);
    origin = parseForkOrigin(input);
  }
  catch (error) { return json({ error: error instanceof Error ? error.message : "Invalid source pack." }, 400); }
  const sb = supabaseFor(token);
  const { data: auth, error: authError } = await sb.auth.getUser();
  if (authError || !auth.user) return json({ error: "Sign in to create a pack." }, 401);
  const { data, error } = await sb.rpc(origin ? "tn_fork_pack" : "tn_create_pack", {
    ...(origin ? { p_parent_id: origin.id, p_parent_revision: origin.revision } : {}),
    p_title: body.title, p_description: body.description, p_category: body.category,
    p_tags: body.tags, p_is_public: body.is_public, p_entries: body.entries,
  });
  if (error) {
    if (origin && error.code === "PT404") return json({ error: "The original pack is unavailable. Your copy has not been saved." }, 404);
    if (origin && error.code === "PT409") return json({ error: "The original pack changed. Your draft is still here; reload the original before making a new copy." }, 409);
    if (["23503", "23505", "23514", "42501", "22P02", "22023", "23502"].includes(error.code)) return json({ error: "Choose existing link sources, without duplicates, and try again." }, 400);
    return json({ error: origin ? "Attributed copying is unavailable. Your draft is still here; try again when pack storage is ready." : "Could not save this pack. Check database setup and try again." }, 503);
  }
  return json({ id: data }, 201);
}
