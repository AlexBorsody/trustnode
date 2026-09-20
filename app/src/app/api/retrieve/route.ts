import { NextResponse } from "next/server";
import { bearerToken, supabaseConfigured, supabaseFor } from "@/lib/supabase";
import { verifyClaim } from "@/trustnode/pipeline";
import { rankSources, RANKING_VERSION } from "@/trustnode/ranking";
import { buildCandidates, parseRetrieval, RETRIEVAL_LIMITS, type PublicPack, type SelectedPack, type ShelfSource } from "@/trustnode/retrieval";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Authorization", "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });
export async function OPTIONS() { return new NextResponse(null, { status: 204, headers }); }
export async function POST(req: Request) {
  let input;
  try { input = parseRetrieval(await req.json()); }
  catch (error) { return json({ error: error instanceof Error ? error.message : "Invalid retrieval request." }, 400); }
  const warnings: string[] = [];
  let shelf: ShelfSource[] = [], packs: PublicPack[] = [], selected: SelectedPack | undefined;
  let shelfStatus = "not_configured", packStatus = "not_configured";
  if (supabaseConfigured()) {
    // Public adoption MUST use an anonymous client, irrespective of the caller.
    const publicClient = supabaseFor();
    if (input.pack_id) {
      const token = bearerToken(req);
      const caller = token ? supabaseFor(token) : publicClient;
      try {
        if (token) {
          const { data, error } = await caller.auth.getUser();
          if (error || !data.user) return json({ error: "Sign in again to use your private packs." }, 401);
        }
        const { data, error } = await caller.from("tn_packs")
          .select("id,title,is_public,tn_pack_sources(source_id,rank,tn_sources(id,title,url,excerpt,kind,status))")
          .eq("id", input.pack_id).maybeSingle();
        if (error) return json({ error: "Selected pack is unavailable. Check database setup." }, 503);
        if (!data) return json({ error: "Pack not found or private." }, 404);
        selected = data as unknown as SelectedPack;
      } catch { return json({ error: "Could not load the selected pack. Try again." }, 503); }
    }
    // Independent bounded reads; one unavailable layer must not disable the rest.
    const [sourceRead, packRead] = await Promise.allSettled([
      publicClient.from("tn_sources").select("id,title,url,excerpt,kind,status").eq("kind", "link").eq("status", "ready")
        .order("created_at", { ascending: false }).order("id", { ascending: true }).limit(RETRIEVAL_LIMITS.community_sources),
      publicClient.from("tn_packs").select("id,owner_id,tn_pack_sources(source_id,rank,tn_sources(url))").eq("is_public", true)
        .order("created_at", { ascending: false }).order("id", { ascending: true }).limit(RETRIEVAL_LIMITS.public_packs),
    ]);
    if (sourceRead.status === "fulfilled" && !sourceRead.value.error) {
      shelf = (sourceRead.value.data ?? []) as ShelfSource[]; shelfStatus = "available";
    } else { shelfStatus = "unavailable"; warnings.push("Community shelf unavailable; it was not included in the general source scan."); }
    if (packRead.status === "fulfilled" && !packRead.value.error) {
      packs = (packRead.value.data ?? []) as unknown as PublicPack[]; packStatus = "available";
    } else { packStatus = "unavailable"; warnings.push("Public pack signals unavailable. Rankings omit adoption influence; check the source-pack migration."); }
  } else {
    if (input.pack_id) return json({ error: "Source packs need a configured database." }, 503);
    warnings.push("Database not configured: exploring the bundled OAuth/PKCE seed corpus only.");
  }
  const candidates = buildCandidates(shelf, packs, selected);
  const canonical = verifyClaim(input.query);
  return json({ query: input.query, algorithm_version: RANKING_VERSION,
    results: rankSources(input.query, candidates, { limit: input.limit, usePackSignals: input.use_pack_signals }),
    canonical_verification: canonical,
    controls: input, selected_pack: selected ? { id: selected.id, title: selected.title, is_public: selected.is_public } : null,
    corpus: { candidates: candidates.length, community_rows: shelf.length, public_packs: packs.length,
      shelf_status: shelfStatus, pack_status: packStatus, limits: RETRIEVAL_LIMITS }, warnings,
    note: "Retrieval score is a navigation aid, not a probability or factual verdict. Analyst-seeded trust and public curator preference are separate displayed factors. Canonical verification uses its fixed seed corpus independently of these controls.",
  });
}
