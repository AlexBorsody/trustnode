/**
 * TrustNode prototype pipeline v0.1.0 — claim verification.
 *
 *   claim -> normalize -> retrieve -> stance -> conflicts -> confidence
 *
 * RULES (from the Trust Commons Charter):
 *  - Article VI: AI explains; it does not decide. This pipeline is fully
 *    deterministic. An LLM claim-extractor may plug in upstream later; it
 *    will never touch the numbers below.
 *  - Article I: every output is traceable. Confidence ships with its
 *    derivation, not as a bare number.
 *  - Article V: community votes are a displayed signal, never silently
 *    merged into scores.
 */
import sourcesDoc from "../../data/sources.json";

export type Stance = "supports" | "contradicts" | "qualifies" | "unrelated";
export type Freshness = "current" | "stale" | "superseded";

export interface TrustSignals {
  earned: number; // analyst-seeded 0..10; real deployments measure track record
  earned_rationale: string;
  community: number; // 0..10, displayed only — never merged into confidence
  community_votes: number;
}

export interface SourceSeed {
  id: string;
  title: string;
  url: string;
  publisher: string;
  published: string;
  updated: string;
  superseded_by: string | null;
  trust: TrustSignals;
  keywords: string[];
  stances: { claim_pattern: string[]; stance: Exclude<Stance, "unrelated">; quote: string; note: string | null }[];
}

export interface SourceResult {
  id: string;
  title: string;
  url: string;
  publisher: string;
  freshness: Freshness;
  freshness_detail: string;
  trust: TrustSignals;
  stance: Stance;
  quote: string | null;
  stance_note: string | null;
  match_explain: string;
}

export interface Conflict {
  type: "contradiction" | "outdated";
  sources: string[];
  detail: string;
}

export interface Verification {
  claim: string;
  normalized: string;
  pipeline_version: string;
  sources: SourceResult[];
  conflicts: Conflict[];
  confidence: { value: number; level: string; derivation: string };
  note: string;
}

const STOP = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "for", "of", "to", "in", "on", "and", "or", "this", "that", "it", "its",
  "with", "by", "as", "at", "from", "you", "your", "we", "do", "does",
]);

/** Naive stemmer: good enough for deterministic keyword matching. */
function stem(t: string): string {
  if (t.length <= 3) return t;
  if (t.endsWith("ies")) return t.slice(0, -3) + "y";
  if (t.endsWith("es") && /(s|x|z|ch|sh)es$/.test(t)) return t.slice(0, -2);
  if (t.endsWith("s") && !t.endsWith("ss")) return t.slice(0, -1);
  return t;
}

function tokens(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/)) {
    if (!raw) continue;
    // keep hyphen-joined form too ("single-page" -> "singlepage") for matching
    const forms = raw.includes("-") ? [raw.replace(/-/g, ""), ...raw.split("-")] : [raw];
    for (const f of forms) {
      const s = stem(f);
      if (s.length > 1 && !STOP.has(s)) out.push(s);
    }
  }
  return out;
}

/** Stance matches when enough of its pattern keywords appear in the claim. */
function matchStance(
  claimTokens: string[],
  stances: SourceSeed["stances"],
): { stance: Stance; quote: string | null; note: string | null; hits: string[] } {
  let best: { stance: Stance; quote: string; note: string | null; hits: string[] } | null = null;
  for (const s of stances) {
    const patternTokens = tokens(s.claim_pattern.join(" "));
    const hits = [...new Set(patternTokens.filter((k) => claimTokens.includes(k)))];
    const need = Math.min(2, s.claim_pattern.length);
    if (hits.length >= need && (!best || hits.length > best.hits.length)) {
      best = { stance: s.stance, quote: s.quote, note: s.note, hits };
    }
  }
  return best ?? { stance: "unrelated", quote: null, note: null, hits: [] };
}

function freshnessOf(src: SourceSeed): { status: Freshness; detail: string } {
  // Standards don't expire by age — only by supersession. Age is shown, not penalized.
  if (src.superseded_by) {
    return {
      status: "superseded",
      detail: `Superseded by ${src.superseded_by} (updated ${src.updated}). Its claims reflect older guidance.`,
    };
  }
  return { status: "current", detail: `Updated ${src.updated}.` };
}

export function verifyClaim(rawClaim: string, topK = 6): Verification {
  const claim = rawClaim.trim();
  const claimTokens = tokens(claim);
  const seeds = (sourcesDoc as { sources: SourceSeed[] }).sources;

  // --- retrieve: rank sources by keyword overlap with the claim ---
  const ranked = seeds
    .map((src) => {
      const hay = tokens(src.title + " " + src.keywords.join(" ")).concat(
        src.stances.flatMap((s) => tokens(s.claim_pattern.join(" "))),
      );
      const hits = [...new Set(hay.filter((t) => claimTokens.includes(t)))];
      return { src, score: hits.length, hits };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  const sources: SourceResult[] = ranked.map(({ src, hits }) => {
    const m = matchStance(claimTokens, src.stances);
    const f = freshnessOf(src);
    return {
      id: src.id,
      title: src.title,
      url: src.url,
      publisher: src.publisher,
      freshness: f.status,
      freshness_detail: f.detail,
      trust: src.trust,
      stance: m.stance,
      quote: m.quote,
      stance_note: m.note,
      match_explain:
        m.stance === "unrelated"
          ? `Retrieved by keyword overlap (${hits.join(", ")}) but takes no position on this claim.`
          : `Matched on: ${m.hits.join(", ")}.`,
    };
  });

  // --- conflicts: contradictions between sources + outdated reliance ---
  const conflicts: Conflict[] = [];
  const supporting = sources.filter((s) => s.stance === "supports");
  const contradicting = sources.filter((s) => s.stance === "contradicts");
  if (supporting.length && contradicting.length) {
    const rankedByTrust = [...supporting, ...contradicting].sort(
      (a, b) => b.trust.earned - a.trust.earned,
    );
    const top = rankedByTrust[0];
    conflicts.push({
      type: "contradiction",
      sources: [supporting[0].id, contradicting[0].id],
      detail:
        `Sources disagree. Highest-earned source (${top.title}, earned trust ` +
        `${top.trust.earned}/10) ${top.stance === "supports" ? "supports" : "contradicts"} the claim. ` +
        `Read both quotes before deciding.`,
    });
  }
  const reliedStale = sources.filter(
    (s) => s.stance !== "unrelated" && s.freshness !== "current",
  );
  for (const s of reliedStale) {
    conflicts.push({
      type: "outdated",
      sources: [s.id],
      detail: `${s.title}: ${s.freshness_detail}`,
    });
  }

  // --- confidence: transparent, derived, shown with its working ---
  // support  = min(1, sum(earned/10 of supporters) / 2)
  // contra   = min(1, sum(earned/10 of contradictors) / 2)
  // stale    = 0.2 if any relied-upon source is not current
  // confidence = 100 * clamp(support * (1 - 0.6*contra) - stale, 0, 1)
  const wsum = (list: SourceResult[]) =>
    list.reduce((a, s) => a + s.trust.earned / 10, 0);
  const support = Math.min(1, wsum(supporting) / 2);
  const contra = Math.min(1, wsum(contradicting) / 2);
  const stale = reliedStale.length ? 0.2 : 0;
  const raw = Math.min(1, Math.max(0, support * (1 - 0.6 * contra) - stale));
  const value = Math.round(raw * 100);
  const level =
    value >= 80 ? "well supported" : value >= 50 ? "partially supported" : value >= 20 ? "contested" : "unsupported";
  const derivation =
    `support ${support.toFixed(2)} × (1 − 0.6 × contradiction ${contra.toFixed(2)}) − staleness ${stale.toFixed(1)}` +
    ` = ${raw.toFixed(2)} → ${value}/100. ` +
    `Community votes shown per source are never merged into this number (Charter Art. V).`;

  return {
    claim,
    normalized: claimTokens.join(" "),
    pipeline_version: "0.1.0",
    sources,
    conflicts,
    confidence: { value, level, derivation },
    note: "Deterministic prototype pipeline. No model graded its own homework — claim extraction is keyword-based; an LLM extractor may plug in upstream later without touching these numbers.",
  };
}

export function demoClaims(): string[] {
  return [
    "This configuration requires OAuth PKCE",
    "PKCE is only for mobile apps",
    "The implicit flow is fine for single-page apps",
  ];
}
