import { NextResponse } from "next/server";
import { bearerToken, supabaseConfigured, supabaseFor } from "@/lib/supabase";
import { UUID } from "@/packs/model";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Authorization" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return json({ error: "Pack not found." }, 404);
  if (!supabaseConfigured()) return json({ error: "Source packs need a configured database." }, 503);
  const sb = supabaseFor(bearerToken(req) ?? undefined);
  const { data, error } = await sb.from("tn_packs")
    .select("id,title,description,category,tags,is_public,owner_id,created_at,tn_pack_sources(source_id,rank,note,tn_sources(id,title,url,kind,status))")
    .eq("id", id).maybeSingle();
  if (error) return json({ error: "Source packs are unavailable. Check database setup." }, 503);
  if (!data) return json({ error: "Pack not found or private." }, 404);
  data.tn_pack_sources.sort((a, b) => a.rank - b.rank);
  return json({ pack: data });
}
