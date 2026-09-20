import assert from "node:assert/strict";
import { test } from "node:test";
import { rankSources, RANKING_VERSION, type RankingCandidate, type PackReference } from "../src/trustnode/ranking";

function candidate(overrides: Partial<RankingCandidate> = {}): RankingCandidate {
  return { id: "source-a", title: "OAuth security", url: "https://example.com/oauth",
    text: "Use PKCE for access tokens.", origin: "seed", earned: 8, ...overrides };
}

const reference = (owner_id: string, rank: number, pack_id = `${owner_id}-pack`): PackReference =>
  ({ owner_id, rank, pack_id });

test("hand-computed factors explain retrieval independently of confidence", () => {
  const [result] = rankSources("OAuth PKCE tokens encryption", [candidate({
    superseded_by: "new-standard",
    pack_references: [reference("alice", 2), reference("bob", 4)],
  })]);
  assert.deepEqual(result.matched_terms, ["oauth", "pkce", "token"]);
  assert.deepEqual(result.factors, { relevance: 3.75, earned: 1.6, pack_adoption: 0.75, staleness: 1 });
  assert.equal(result.score, 5.1);
  assert.deepEqual(result.pack_summary, { curators: 2, pack_count: 2, reciprocal_rank_sum: 0.75 });
  assert.ok(result.derivation.startsWith(RANKING_VERSION));
  assert.match(result.derivation, /3\/4 distinct query terms/);
  assert.match(result.derivation, /retrieval score 5\.1000/);
  assert.match(result.derivation, /not verification confidence or measured graph trust/);
});

test("earned and pack signals cannot retrieve a source without query overlap", () => {
  assert.deepEqual(rankSources("astronomy", [candidate({ earned: 10,
    pack_references: [reference("alice", 1), reference("bob", 1)] })]), []);
  assert.deepEqual(rankSources("the and of", [candidate()]), []);
  assert.deepEqual(rankSources("", [candidate()]), []);
});

test("title, text, and keywords all supply normalized matching terms", () => {
  const [result] = rankSources("OAuth PKCE browser", [candidate({ keywords: ["browsers"] })]);
  assert.deepEqual(result.matched_terms, ["browser", "oauth", "pkce"]);
  assert.equal(result.factors.relevance, 5);
});

test("repeating query terms and stuffing source text cannot increase relevance", () => {
  const [normal] = rankSources("OAuth browser", [candidate()]);
  const [stuffed] = rankSources("OAuth OAuth browser browser", [candidate({
    title: "OAuth ".repeat(1000), text: "OAuth ".repeat(1000), keywords: Array(1000).fill("OAuth"),
  })]);
  assert.equal(normal.factors.relevance, 2.5);
  assert.equal(stuffed.factors.relevance, normal.factors.relevance);
  assert.equal(stuffed.score, normal.score);
});

test("a curator cannot increase adoption by copying packs or repeating references", () => {
  const base = candidate({ pack_references: [reference("alice", 2)] });
  const copies = Array.from({ length: 1000 }, (_, i) => reference("alice", 2, `copy-${i}`));
  const [one] = rankSources("OAuth", [base]);
  const [many] = rankSources("OAuth", [{ ...base, pack_references: [...copies, ...copies] }]);
  assert.equal(one.factors.pack_adoption, 0.5);
  assert.equal(many.factors.pack_adoption, 0.5);
  assert.equal(many.pack_summary.curators, 1);
  assert.equal(many.pack_summary.pack_count, 1000);
  assert.equal(many.score, one.score);
});

test("each curator contributes only their highest reciprocal rank", () => {
  const [result] = rankSources("OAuth", [candidate({ pack_references: [
    reference("alice", 8, "alice-low"), reference("alice", 2, "alice-high"), reference("bob", 4),
  ] })]);
  assert.equal(result.factors.pack_adoption, 0.75);
  assert.deepEqual(result.pack_summary, { curators: 2, pack_count: 3, reciprocal_rank_sum: 0.75 });
});

test("adoption is capped at two points without hiding raw counts", () => {
  const [result] = rankSources("OAuth", [candidate({ earned: 999, pack_references:
    Array.from({ length: 100 }, (_, i) => reference(`curator-${i}`, 1)) })]);
  assert.equal(result.factors.pack_adoption, 2);
  assert.equal(result.factors.earned, 2);
  assert.equal(result.score, 9);
  assert.equal(result.pack_summary.curators, 100);
  assert.equal(result.pack_summary.reciprocal_rank_sum, 100);
});

test("community earned is always zero, even when a supplied value is high", () => {
  const [result] = rankSources("OAuth", [candidate({ origin: "community", earned: 10 })]);
  assert.equal(result.factors.earned, 0);
  assert.equal(result.score, 5);
  assert.match(result.derivation, /community sources receive 0/);
});

test("negative and non-finite earned inputs cannot corrupt the score", () => {
  for (const earned of [-100, NaN, Infinity, -Infinity]) {
    const [result] = rankSources("OAuth", [candidate({ earned })]);
    assert.equal(result.factors.earned, 0);
    assert.equal(result.score, 5);
  }
});

test("invalid pack positions and missing identities do not contribute", () => {
  const [result] = rankSources("OAuth", [candidate({ pack_references: [
    reference("alice", 0), reference("bob", -1), reference("carol", 0.5),
    reference("dave", NaN), reference("eve", Infinity), reference("frank", Number.MAX_SAFE_INTEGER + 1),
    reference("", 1, "orphan"), reference("   ", 1, "whitespace"), reference("grace", 1, ""),
  ] })]);
  assert.equal(result.factors.pack_adoption, 0);
  assert.deepEqual(result.pack_summary, { curators: 0, pack_count: 0, reciprocal_rank_sum: 0 });
  assert.equal(result.score, 6.6);
});

test("disabling pack signals preserves provenance but removes their score contribution", () => {
  const input = candidate({ pack_references: [reference("alice", 1)] });
  const [enabled] = rankSources("OAuth", [input]);
  const [disabled] = rankSources("OAuth", [input], { usePackSignals: false });
  assert.equal(enabled.score - disabled.score, 1);
  assert.equal(disabled.factors.pack_adoption, 0);
  assert.deepEqual(disabled.pack_summary, enabled.pack_summary);
  assert.deepEqual(disabled.pack_references, enabled.pack_references);
  assert.match(disabled.derivation, /public-pack signal disabled/);
});

test("only recorded supersession applies a staleness penalty", () => {
  const [current] = rankSources("OAuth", [candidate()]);
  const [superseded] = rankSources("OAuth", [candidate({ superseded_by: "replacement" })]);
  assert.equal(current.factors.staleness, 0);
  assert.equal(superseded.factors.staleness, 1);
  assert.equal(current.score - superseded.score, 1);
});

test("ties use stable source IDs and limit is applied after sorting", () => {
  const inputs = [candidate({ id: "z" }), candidate({ id: "a" }), candidate({ id: "m" })];
  assert.deepEqual(rankSources("OAuth", inputs).map((result) => result.id), ["a", "m", "z"]);
  assert.deepEqual(rankSources("OAuth", inputs, { limit: 2 }).map((result) => result.id), ["a", "m"]);
  assert.deepEqual(rankSources("OAuth", inputs, { limit: 0 }), []);
});

test("candidate and pack-reference order cannot change any ranking output", () => {
  const references = Array.from({ length: 30 }, (_, i) => reference(`curator-${i}`, i + 1));
  const inputs = [candidate({ id: "b", pack_references: references }), candidate({ id: "a", pack_references: references })];
  const before = structuredClone(inputs);
  const result = rankSources("OAuth PKCE encryption", inputs);
  const shuffled = [...inputs].reverse().map((input) => ({ ...input, pack_references: [...references].reverse() }));
  assert.deepEqual(rankSources("OAuth PKCE encryption", shuffled), result);
  assert.deepEqual(inputs, before, "ranking must not mutate inputs");
});

test("rounded factors reproduce a four-decimal total", () => {
  const [result] = rankSources("OAuth geometry astronomy", [candidate({
    earned: 3.333333, pack_references: [reference("alice", 3), reference("bob", 7)],
  })]);
  assert.deepEqual(result.factors, { relevance: 1.6667, earned: 0.6667, pack_adoption: 0.4762, staleness: 0 });
  assert.equal(result.score, 2.8096);
  assert.equal(Math.round(Object.values(result.factors).reduce((sum, n) => sum + n, 0) * 10_000) / 10_000, result.score);
});
