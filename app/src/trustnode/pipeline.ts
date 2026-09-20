/**
 * TrustNode prototype pipeline — claim verification.
 * (Pipeline version: PIPELINE_VERSION in ./version — single source of truth.)
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
import { PIPELINE_VERSION } from "./version";

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
  /** Free-text excerpt, used in retrieval for community-contributed sources. */
  text?: string;
  stances: { claim_pattern: string[]; stance: Exclude<Stance, "unrelated">; quote: string; note: string | null }[];
}

export interface SourceResult {
  id: string;
  origin: "seed" | "community";
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
  /** DESIGN §14: set when a negation cue in the claim mechanically inverted the stance. */
  negation?: boolean;
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

export function tokens(text: string): string[] {
  return tokenize(text).map((t) => t.text);
}

/**
 * A normalized token plus the index of the raw word it came from.
 * DESIGN §14: the tokenizer records each surviving token's raw word index
 * (parallel array) so the negation pass can locate cues relative to matched
 * keywords without re-parsing the claim.
 */
export interface Token {
  text: string;
  word: number;
}

export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  const words = text.toLowerCase().trim().split(/\s+/);
  words.forEach((rawWord, wi) => {
    if (!rawWord) return;
    for (const raw of rawWord.replace(/[^a-z0-9\s-]/g, " ").split(/\s+/)) {
      if (!raw) continue;
      // keep hyphen-joined form too ("single-page" -> "singlepage") for matching
      const forms = raw.includes("-") ? [raw.replace(/-/g, ""), ...raw.split("-")] : [raw];
      for (const f of forms) {
        const s = stem(f);
        if (s.length > 1 && !STOP.has(s)) out.push({ text: s, word: wi });
      }
    }
  });
  return out;
}

// ---------------------------------------------------------------------------
// DESIGN §14 — negation handling (BUG-001). Deterministic, no model.
// Two passes, because one pass is not enough: stemming and stop-word removal
// destroy contractions ("doesn't" -> "doesn"+"t"), so cues must be caught on
// the raw claim before normalization.
// ---------------------------------------------------------------------------

const NEGATION_CUES =
  "not|no|never|without|cannot|fails?|failed|don't|doesn't|does not|isn't|aren't|can't|won't|couldn't";

export const NEGATION_NOTE =
  "Negation detected in claim — stance mechanically inverted; analyst review advised.";

/** Word indexes (into the raw whitespace-split claim) of every negation cue. */
function negationCueWords(rawClaim: string): number[] {
  // Normalize Unicode apostrophes (U+2019 etc., common from mobile keyboards)
  // to ASCII so "doesn’t" cues like "doesn't" — same cue, different encoding.
  const lower = rawClaim.toLowerCase().replace(/[’‘‚‛]/g, "'");
  const re = new RegExp(`\\b(${NEGATION_CUES})\\b`, "g");
  const out: number[] = [];
  for (const m of lower.matchAll(re)) {
    const before = lower.slice(0, m.index).trim();
    out.push(before === "" ? 0 : before.split(/\s+/).length);
  }
  return out;
}

/** Stance matches when enough of its pattern keywords appear in the claim. */
function matchStance(
  rawClaim: string,
  claimToks: Token[],
  stances: SourceSeed["stances"],
): { stance: Stance; quote: string | null; note: string | null; hits: string[]; negation: boolean } {
  const claimTexts = claimToks.map((t) => t.text);
  const cueWords = negationCueWords(rawClaim);
  const wordOf = (keyword: string): number =>
    claimToks.find((t) => t.text === keyword)?.word ?? -1;
  // A matched keyword counts as negated when a cue sits within ±4 raw words.
  const isNegated = (keyword: string): boolean => {
    const w = wordOf(keyword);
    return w >= 0 && cueWords.some((c) => Math.abs(c - w) <= 4);
  };

  let best: {
    stance: Exclude<Stance, "unrelated">;
    quote: string;
    note: string | null;
    hits: string[];
    negated: boolean;
  } | null = null;
  for (const s of stances) {
    const patternTokens = tokens(s.claim_pattern.join(" "));
    const hits = [...new Set(patternTokens.filter((k) => claimTexts.includes(k)))];
    const need = Math.min(2, s.claim_pattern.length);
    if (hits.length >= need && (!best || hits.length > best.hits.length)) {
      best = {
        stance: s.stance,
        quote: s.quote,
        note: s.note,
        hits,
        negated: hits.some(isNegated),
      };
    }
  }
  if (!best) {
    return { stance: "unrelated", quote: null, note: null, hits: [], negation: false };
  }
  if (best.negated) {
    const flipped =
      best.stance === "supports"
        ? "contradicts"
        : best.stance === "contradicts"
          ? "supports"
          : best.stance; // qualifies: left as-is, still flagged
    return {
      stance: flipped,
      quote: best.quote,
      note: NEGATION_NOTE,
      hits: best.hits,
      negation: true,
    };
  }
  return {
    stance: best.stance,
    quote: best.quote,
    note: best.note,
    hits: best.hits,
    negation: false,
  };
}

/** Mechanical stance for an unreviewed community source: pure keyword overlap,
 *  labeled as unreviewed, never an analyst position. Supplemental retrieval is
 *  isolated from canonical confidence and conflicts (Charter Art. IX). */
export function communityTextStance(
  title: string,
  text: string,
): SourceSeed["stances"] {
  const kw = [...new Set(tokens(`${title} ${text}`).filter((t) => t.length > 2))].slice(0, 14);
  if (kw.length < 2) return [];
  return [
    {
      claim_pattern: kw,
      stance: "supports",
      quote: text.slice(0, 280) || title,
      note: "Unreviewed community contribution — position inferred from keyword overlap only. No analyst stance recorded; zero earned trust, so it cannot move the confidence number.",
    },
  ];
}

function freshnessOf(src: SourceSeed): { status: Freshness; detail: string } {  // Standards don't expire by age — only by supersession. Age is shown, not penalized.
  if (src.superseded_by) {
    return {
      status: "superseded",
      detail: `Superseded by ${src.superseded_by} (updated ${src.updated}). Its claims reflect older guidance.`,
    };
  }
  return { status: "current", detail: `Updated ${src.updated}.` };
}

export function verifyClaim(
  rawClaim: string,
  topK = 6,
  extra: SourceSeed[] = [],
): Verification {
  const claim = rawClaim.trim();
  const claimToks = tokenize(claim);
  const claimTokens = claimToks.map((t) => t.text);
  const seeds = (sourcesDoc as { sources: SourceSeed[] }).sources;
  // --- retrieve independently: community results cannot displace seeds ---
  // Keep the existing seed tie order; community ties use stable IDs so database
  // return order does not decide which supplemental results are displayed.
  const retrieve = (corpus: SourceSeed[], origin: SourceResult["origin"]): SourceResult[] => {
    const ranked = corpus
      .map((src, index) => {
        const hay = tokens(
          src.title + " " + src.keywords.join(" ") + " " + (src.text ?? ""),
        ).concat(src.stances.flatMap((s) => tokens(s.claim_pattern.join(" "))));
        const hits = [...new Set(hay.filter((t) => claimTokens.includes(t)))];
        return { src, index, score: hits.length, hits };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || (
        origin === "community"
          ? (a.src.id < b.src.id ? -1 : a.src.id > b.src.id ? 1 : 0)
          : a.index - b.index
      ))
      .slice(0, topK);

    return ranked.map(({ src, hits }) => {
      const m = matchStance(claim, claimToks, src.stances);
      const f = freshnessOf(src);
      const matchExplain =
        m.stance === "unrelated"
          ? `Retrieved by keyword overlap (${hits.join(", ")}) but takes no analyzed position on this claim.`
          : `Matched on: ${m.hits.join(", ")}.`;
      return {
        id: src.id,
        origin,
        title: src.title,
        url: src.url,
        publisher: src.publisher,
        freshness: f.status,
        freshness_detail: f.detail,
        trust: origin === "community"
          ? {
            ...src.trust,
            earned: 0,
            earned_rationale: "Unreviewed community contribution; excluded from canonical confidence and conflicts.",
          }
          : { ...src.trust },
        stance: m.stance,
        quote: m.quote,
        stance_note: m.note,
        ...(m.negation ? { negation: true as const } : {}),
        match_explain: origin === "community"
          ? `Supplemental community result — excluded from canonical confidence and conflicts. ${matchExplain}`
          : matchExplain,
      };
    });
  };
  const canonicalSources = retrieve(seeds, "seed");
  const sources = [...canonicalSources, ...retrieve(extra, "community")];

  // --- conflicts: canonical contradictions + outdated canonical reliance ---
  const conflicts: Conflict[] = [];
  const supporting = canonicalSources.filter((s) => s.stance === "supports");
  const contradicting = canonicalSources.filter((s) => s.stance === "contradicts");
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
  const reliedStale = canonicalSources.filter(
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
    `Community votes shown per source are never merged into this number (Charter Art. V); ` +
    `community-contributed sources are retrieved separately with zero earned trust and excluded from canonical confidence and conflicts (Charter Art. IX).`;

  return {
    claim,
    normalized: claimTokens.join(" "),
    pipeline_version: PIPELINE_VERSION,
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
