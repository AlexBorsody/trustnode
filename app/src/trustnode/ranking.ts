import { tokens } from "./pipeline";

/** Version the formula whenever a change can alter a source's retrieval score. */
export const RANKING_VERSION = "retrieval-v1";

export interface PackReference {
  pack_id: string;
  owner_id: string;
  /** One-based position in a public source pack. */
  rank: number;
}

export interface RankingCandidate {
  id: string;
  title: string;
  url: string;
  text: string;
  keywords?: string[];
  origin: "seed" | "community";
  earned: number;
  superseded_by?: string | null;
  /** Public references only; the caller must enforce visibility. */
  pack_references?: PackReference[];
}

export interface RankingFactors {
  relevance: number;
  earned: number;
  pack_adoption: number;
  /** A positive penalty, subtracted from the other factors. */
  staleness: number;
}

export interface RankingResult extends RankingCandidate {
  score: number;
  factors: RankingFactors;
  matched_terms: string[];
  derivation: string;
  pack_summary: {
    curators: number;
    pack_count: number;
    reciprocal_rank_sum: number;
  };
}

export interface RankingOptions {
  limit?: number;
  usePackSignals?: boolean;
}

const round = (value: number): number => Math.round(value * 10_000) / 10_000;
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

function publicPackSummary(references: PackReference[]) {
  // Sorting also makes floating-point addition independent of database row order.
  const ordered = references.filter((reference) =>
    typeof reference.pack_id === "string" && reference.pack_id.trim().length > 0 &&
    typeof reference.owner_id === "string" && reference.owner_id.trim().length > 0 &&
    Number.isSafeInteger(reference.rank) && reference.rank >= 1
  ).sort((a, b) =>
    compare(a.owner_id, b.owner_id) || compare(a.pack_id, b.pack_id) || a.rank - b.rank
  );
  const curatorBest = new Map<string, number>();
  const packs = new Set<string>();
  for (const reference of ordered) {
    packs.add(reference.pack_id);
    curatorBest.set(reference.owner_id, Math.max(
      curatorBest.get(reference.owner_id) ?? 0,
      1 / reference.rank,
    ));
  }
  const reciprocalRankSum = [...curatorBest.values()].reduce((sum, rank) => sum + rank, 0);
  return { ordered, reciprocalRankSum, summary: {
    curators: curatorBest.size,
    pack_count: packs.size,
    reciprocal_rank_sum: round(reciprocalRankSum),
  } };
}

/**
 * Deterministic retrieval score, not a confidence estimate or measured graph trust:
 *   relevance = 5 * distinct matched query terms / distinct query terms
 *   earned = 2 * clamp(analyst-seeded earned, 0, 10) / 10 (community: 0)
 *   pack adoption = min(2, sum over curators of max(1 / one-based pack rank))
 *   staleness = 1 when explicitly superseded, otherwise 0
 *   score = relevance + earned + pack adoption - staleness
 *
 * Only overlapping candidates qualify, however strong their other signals.
 * Repeated terms add no relevance; each curator contributes at most one point
 * across all their packs. Pack signals can be disabled without hiding the counts.
 * Four-decimal factors are added to produce a reproducible, explainable total.
 * No corroboration/contradiction signal is inferred without recorded graph data.
 */
export function rankSources(
  query: string,
  candidates: RankingCandidate[],
  options: RankingOptions = {},
): RankingResult[] {
  const queryTerms = [...new Set(tokens(query))].sort(compare);
  if (queryTerms.length === 0) return [];

  const results: RankingResult[] = [];
  for (const candidate of candidates) {
    const sourceTerms = new Set(tokens([
      candidate.title,
      candidate.text,
      ...(candidate.keywords ?? []),
    ].join(" ")));
    const matched_terms = queryTerms.filter((term) => sourceTerms.has(term));
    if (matched_terms.length === 0) continue;

    const packs = publicPackSummary(candidate.pack_references ?? []);
    const earned = candidate.origin === "seed" && Number.isFinite(candidate.earned)
      ? Math.min(10, Math.max(0, candidate.earned)) / 10 * 2
      : 0;
    const factors: RankingFactors = {
      relevance: round(matched_terms.length / queryTerms.length * 5),
      earned: round(earned),
      pack_adoption: options.usePackSignals === false ? 0 : round(Math.min(2, packs.reciprocalRankSum)),
      staleness: candidate.superseded_by ? 1 : 0,
    };
    const score = round(factors.relevance + factors.earned + factors.pack_adoption - factors.staleness);
    const adoptionNote = options.usePackSignals === false
      ? "public-pack signal disabled"
      : `min(2, ${packs.summary.reciprocal_rank_sum.toFixed(4)} reciprocal rank from ${packs.summary.curators} distinct curators)`;

    results.push({
      ...candidate,
      ...(candidate.pack_references ? { pack_references: packs.ordered } : {}),
      score,
      factors,
      matched_terms,
      pack_summary: packs.summary,
      derivation: `${RANKING_VERSION}: relevance ${factors.relevance.toFixed(4)} (${matched_terms.length}/${queryTerms.length} distinct query terms × 5) + analyst-seeded earned ${factors.earned.toFixed(4)} (${candidate.origin === "community" ? "community sources receive 0" : "clamped 0–10, scaled to 0–2"}) + public-pack adoption ${factors.pack_adoption.toFixed(4)} (${adoptionNote}) − supersession penalty ${factors.staleness.toFixed(4)} = retrieval score ${score.toFixed(4)}. Retrieval order only; not verification confidence or measured graph trust.`,
    });
  }
  results.sort((a, b) => b.score - a.score || compare(a.id, b.id));
  const limit = options.limit === undefined || !Number.isFinite(options.limit)
    ? results.length
    : Math.max(0, Math.floor(options.limit));
  return results.slice(0, limit);
}
