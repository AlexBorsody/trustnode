import { NextResponse } from "next/server";
import { bearerToken, supabaseConfigured, supabaseFor } from "@/lib/supabase";
import { UUID } from "@/packs/model";
import { parseTemplateCapture, seedDistribution, type TemplateVersion } from "@/packs/templates";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Authorization" };
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers });
type Context = { params: Promise<{ id: string }> };

export async function GET(req: Request, context: Context) {
  const { id } = await context.params;
  const versionId = new URL(req.url).searchParams.get("version");
  if (!UUID.test(id) || (versionId !== null && !UUID.test(versionId))) return json({ error: "Template not found." }, 404);
  if (!supabaseConfigured()) return json({ error: "Templates need a configured database." }, 503);
  const token = bearerToken(req), sb = supabaseFor(token ?? undefined);
  if (token) {
    const { data, error } = await sb.auth.getUser();
    if (error || !data.user) return json({ error: "Sign in again to use your templates." }, 401);
  }
  const { data: pack, error: packError } = await sb.from("tn_packs")
    .select("id,revision,owner_id,is_public,tn_pack_sources(source_id,rank,note,tn_sources(id,title,url,status,site_id,normalized_url,tn_sites(host)))")
    .eq("id", id).maybeSingle();
  if (packError) return json({ error: "Seed template storage is not available yet. Try again after setup." }, 503);
  if (!pack) return json({ error: "Pack not found or private." }, 404);
  let query = sb.from("tn_pack_versions").select("*").eq("pack_id", id);
  if (versionId) query = query.eq("id", versionId);
  const { data, error } = await query.order("created_at", { ascending: false }).order("id").limit(20);
  if (error) return json({ error: "Could not load template versions. Check database setup." }, 503);
  if (versionId && !data?.length) return json({ error: "Template version not found." }, 404);
  const versions = (data ?? []) as TemplateVersion[];
  return json({ pack, versions: versions.map(v => ({ ...v, distribution: seedDistribution(v.snapshot.entries, v.snapshot.seed_mode) })), limit: 20 });
}

export async function POST(req: Request, context: Context) {
  const { id } = await context.params;
  if (!UUID.test(id)) return json({ error: "Pack not found." }, 404);
  const token = bearerToken(req);
  if (!token) return json({ error: "Sign in to save a template version." }, 401);
  let input;
  try { input = parseTemplateCapture(await req.json()); }
  catch (error) { return json({ error: error instanceof Error ? error.message : "Invalid template." }, 400); }
  if (!supabaseConfigured()) return json({ error: "Templates need a configured database." }, 503);
  const sb = supabaseFor(token);
  const { data: auth, error: authError } = await sb.auth.getUser();
  if (authError || !auth.user) return json({ error: "Sign in again to save your template." }, 401);
  const { data, error } = await sb.rpc("tn_capture_pack_version", {
    p_id: id, p_revision: input.revision, p_mode: input.seed_mode, p_seeds: input.seeds,
  });
  if (error) {
    if (error.code === "PT404") return json({ error: "Pack not found or not owned by your account." }, 404);
    if (error.code === "PT409") return json({ error: "This pack changed. Your seed choices are retained; reload the pack before capturing a new version." }, 409);
    if (["22023", "22P02", "23514", "23503"].includes(error.code)) return json({ error: "Choose ready links in this pack, explain each seed, and check the category path." }, 400);
    return json({ error: "Could not save the template version. Check database setup; your choices are retained." }, 503);
  }
  return json({ id: data }, 201);
}
