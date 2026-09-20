import sourcesDoc from "../../data/sources.json";
import { UUID } from "@/packs/model";
import type { SourceSeed } from "./pipeline";
import type { PackReference, RankingCandidate } from "./ranking";

export const RETRIEVAL_LIMITS = { community_sources: 200, public_packs: 200, results: 20 } as const;
export interface RetrievalRequest { query: string; limit: number; use_pack_signals: boolean; pack_id?: string }
export interface ShelfSource { id: string; title: string; url: string | null; excerpt: string | null; kind: string; status: string }
export interface PublicPack { id: string; owner_id: string; tn_pack_sources: { source_id: string; rank: number; tn_sources: { url: string | null } | null }[] }
export interface SelectedPack { id: string; title: string; is_public: boolean; tn_pack_sources: { source_id: string; rank: number; tn_sources: ShelfSource | null }[] }
export function parseRetrieval(input: unknown): RetrievalRequest {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Expected { query }.");
  const body = input as Record<string, unknown>;
  if (typeof body.query !== "string" || !body.query.trim() || body.query.trim().length > 500) throw new Error("Query must be 1–500 characters.");
  const limit = body.limit ?? 6;
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > RETRIEVAL_LIMITS.results) throw new Error("Result count must be an integer from 1 to 20.");
  if (body.use_pack_signals !== undefined && typeof body.use_pack_signals !== "boolean") throw new Error("Pack influence must be true or false.");
  if (body.pack_id !== undefined && (typeof body.pack_id !== "string" || !UUID.test(body.pack_id))) throw new Error("Invalid source pack ID.");
  return { query: body.query.trim(), limit, use_pack_signals: body.use_pack_signals ?? true,
    ...(body.pack_id ? { pack_id: (body.pack_id as string).toLowerCase() } : {}) };
}
function usableUrl(value: string | null): value is string {
  if (!value) return false;
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !/(^|\.)invalid$/.test(url.hostname); }
  catch { return false; }
}
/** Exact stored URL bridge only: no redirects, hostname-level trust, or fuzzy matching. */
export function buildCandidates(shelf: ShelfSource[], packs: PublicPack[], selected?: SelectedPack): RankingCandidate[] {
  const references = new Map<string, PackReference[]>();
  for (const pack of packs) for (const entry of pack.tn_pack_sources ?? []) {
    const url = entry.tn_sources?.url;
    if (!usableUrl(url ?? null)) continue;
    const key = url!;
    references.set(key, [...(references.get(key) ?? []), { pack_id: pack.id, owner_id: pack.owner_id, rank: entry.rank }]);
  }
  const chosen = selected?.tn_pack_sources.map(e => e.tn_sources).filter((s): s is ShelfSource => !!s && s.kind === "link" && s.status === "ready");
  const chosenUrls = chosen && new Set(chosen.map(s => s.url));
  const byUrl = new Map<string, RankingCandidate>();
  for (const source of (sourcesDoc as { sources: SourceSeed[] }).sources) {
    if (!usableUrl(source.url) || (chosenUrls && !chosenUrls.has(source.url))) continue;
    byUrl.set(source.url, { id: source.id, title: source.title, url: source.url,
      text: source.text ?? "", keywords: [...source.keywords, ...source.stances.flatMap(s => s.claim_pattern)],
      origin: "seed", earned: source.trust.earned, superseded_by: source.superseded_by, pack_references: references.get(source.url) ?? [] });
  }
  // Stable id ordering selects a consistent representative if the shelf has duplicate URLs.
  for (const source of [...(chosen ?? shelf)].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) {
    if (source.kind !== "link" || source.status !== "ready" || !usableUrl(source.url) || byUrl.has(source.url)) continue;
    byUrl.set(source.url, { id: `community:${source.id}`, title: source.title, url: source.url,
      text: (source.excerpt ?? "").slice(0, 8000), origin: "community", earned: 0,
      pack_references: references.get(source.url) ?? [] });
  }
  return [...byUrl.values()];
}
