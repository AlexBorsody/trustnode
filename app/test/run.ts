/**
 * TrustNode Phase 0 regression suite (DESIGN §23).
 *
 * Run: `npm test` (tsx test/run.ts). No network, no database — the pipeline
 * and the extraction module are pure functions of their inputs.
 *
 * Coverage: support, contradiction, qualification, negation, supersession,
 * irrelevant keyword overlap — with the RFC 7636 PKCE claim pinned as a
 * permanent full-JSON snapshot case, plus tokenizer / community-stance /
 * extraction unit tests and a determinism check.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  NEGATION_NOTE,
  communityTextStance,
  tokens,
  verifyClaim,
  type SourceSeed,
  type Stance,
} from "../src/trustnode/pipeline";
import { PIPELINE_VERSION } from "../src/trustnode/version";
import {
  MAX_EXTRACTED_CHARS,
  csvToText,
  extractText,
  jsonToText,
  stripHtml,
} from "../src/trustnode/extract";

const HERE = dirname(fileURLToPath(import.meta.url));
const enc = (s: string) => new TextEncoder().encode(s);

let passed = 0;
let failed = 0;
const failures: string[] = [];

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    failures.push(name);
    console.error(`FAIL ${name}`);
    console.error(e instanceof Error ? e.message.split("\n").slice(0, 6).join("\n") : e);
  }
}

function stanceOf(claim: string, sourceId: string, extra: SourceSeed[] = []) {
  const v = verifyClaim(claim, 6, extra);
  const s = v.sources.find((x) => x.id === sourceId);
  assert.ok(s, `expected ${sourceId} to be retrieved for: ${claim}`);
  return { verification: v, source: s };
}

/** Minimal synthetic seed for hermetic confidence/qualification tests.
 *  Uses nonsense keywords so the real OAuth seeds never retrieve. */
function synthSeed(
  id: string,
  stance: Exclude<Stance, "unrelated">,
  earned: number,
  opts: { pattern?: string[]; supersededBy?: string | null } = {},
): SourceSeed {
  return {
    id,
    title: `Synthetic fixture ${id}`,
    url: `https://example.invalid/${id}`,
    publisher: "test fixture",
    published: "2026-01-01",
    updated: "2026-01-01",
    superseded_by: opts.supersededBy ?? null,
    trust: {
      earned,
      earned_rationale: "synthetic fixture",
      community: 0,
      community_votes: 0,
    },
    keywords: ["zorbian", "flarnet", "quantum", "pickle"],
    stances: [
      {
        claim_pattern: opts.pattern ?? ["zorbian", "flarnet", "require"],
        stance,
        quote: `fixture quote for ${id}`,
        note: null,
      },
    ],
  };
}

async function main(): Promise<void> {
  // ---------------------------------------------------------------- tokenizer
  await test("tokens: hyphen forms, stop words, stemming", () => {
    assert.deepEqual(tokens("single-page apps"), ["singlepage", "single", "page", "app"]);
    assert.deepEqual(tokens("The quick brown fox"), ["quick", "brown", "fox"]);
    assert.deepEqual(tokens("attacks companies"), ["attack", "company"]);
    assert.deepEqual(tokens("PKCE"), ["pkce"]);
  });

  // ------------------------------------------------------- community stances
  await test("communityTextStance: labeled mechanical stance", () => {
    const st = communityTextStance(
      "PKCE guide",
      "PKCE protects OAuth clients with a code challenge",
    );
    assert.equal(st.length, 1);
    assert.equal(st[0].stance, "supports");
    assert.ok(st[0].claim_pattern.length <= 14);
    assert.ok(st[0].quote.length <= 280);
    assert.match(st[0].note ?? "", /Unreviewed/);
  });

  await test("communityTextStance: needs >= 2 keywords", () => {
    assert.deepEqual(communityTextStance("x", ""), []);
    assert.deepEqual(communityTextStance("hi", "ok"), []);
  });

  // -------------------------------------------------------------- extraction
  await test("stripHtml drops scripts/styles/tags", () => {
    assert.equal(
      stripHtml(
        "<html><head><title>T</title></head><body><script>var x=1;</script><p>Hello <b>world</b></p></body></html>",
      ),
      "T Hello world",
    );
  });

  await test("csvToText keeps one line per row", () => {
    assert.equal(csvToText("a,b,c\r\n1,2,3\n\n4,5,6\r\n"), "a,b,c\n1,2,3\n4,5,6");
  });

  await test("jsonToText collects string values in document order", () => {
    assert.equal(
      jsonToText('{"a":"hello","b":{"c":"world"},"d":[1,"x"],"e":null}'),
      "hello\nworld\nx",
    );
  });

  await test("jsonToText throws on invalid JSON", () => {
    assert.throws(() => jsonToText("{nope"), /invalid JSON/);
  });

  await test("extractText: txt/md/html/csv/json", async () => {
    assert.equal(await extractText(enc("hello"), "text/plain"), "hello");
    assert.equal(await extractText(enc("# T\n\nbody"), "text/markdown"), "# T\n\nbody");
    assert.equal(await extractText(enc("<p>Hi</p>"), "text/html"), "Hi");
    assert.equal(await extractText(enc("a,b\n1,2"), "text/csv"), "a,b\n1,2");
    assert.equal(
      await extractText(enc('{"a":"x","b":"y"}'), "application/json"),
      "x\ny",
    );
  });

  await test("extractText: real PDF fixture", async () => {
    const bytes = new Uint8Array(
      readFileSync(join(HERE, "fixtures", "fixture.pdf")),
    );
    const out = await extractText(bytes, "application/pdf");
    assert.match(out, /quick brown fox/);
  });

  await test("extractText: garbage PDF bytes throw (status=failed path)", async () => {
    await assert.rejects(extractText(enc("not a pdf"), "application/pdf"));
  });

  await test("extractText: unsupported MIME throws", async () => {
    await assert.rejects(
      extractText(enc("x"), "image/png"),
      /unsupported MIME/,
    );
  });

  await test("extractText: capped at 200KB", async () => {
    const out = await extractText(enc("a".repeat(300 * 1024)), "text/plain");
    assert.equal(out.length, MAX_EXTRACTED_CHARS);
    assert.equal(MAX_EXTRACTED_CHARS, 200 * 1024);
  });

  // ------------------------------------------------- RFC 7636 pinned snapshot
  await test("RFC 7636 claim pinned: 100/100 well supported", () => {
    const v = verifyClaim(
      "PKCE protects OAuth public clients against authorization code interception attacks",
    );
    assert.equal(v.pipeline_version, PIPELINE_VERSION);
    assert.equal(PIPELINE_VERSION, "0.2.0");
    assert.equal(v.confidence.value, 100);
    assert.equal(v.confidence.level, "well supported");
    const byId = Object.fromEntries(v.sources.map((s) => [s.id, s.stance]));
    assert.equal(byId["rfc7636"], "supports");
    assert.equal(byId["oauth-bcp"], "supports");
    assert.equal(byId["okta-pkce"], "supports");
    assert.deepEqual(v.conflicts, []);
  });

  await test("RFC 7636 snapshot is byte-stable", () => {
    const v = verifyClaim(
      "PKCE protects OAuth public clients against authorization code interception attacks",
    );
    const snap = JSON.parse(
      readFileSync(join(HERE, "__snapshots__", "rfc7636.json"), "utf8"),
    );
    assert.deepEqual(v, snap);
  });

  // ----------------------------------------------------------------- negation
  await test("negation: 'does not' inverts supports -> contradicts", () => {
    const pos = stanceOf(
      "PKCE protects OAuth public clients against interception",
      "rfc7636",
    );
    assert.equal(pos.source.stance, "supports");
    assert.equal(pos.source.negation, undefined);

    const neg = stanceOf(
      "PKCE does not protect OAuth public clients against interception",
      "rfc7636",
    );
    assert.equal(neg.source.stance, "contradicts");
    assert.equal(neg.source.negation, true);
    assert.equal(neg.source.stance_note, NEGATION_NOTE);
  });

  await test("negation: contractions and cue variants invert", () => {
    for (const claim of [
      "PKCE doesn't protect OAuth public clients against interception",
      "PKCE cannot protect OAuth public clients against interception",
      "PKCE never protects OAuth public clients against interception",
      "PKCE works without protecting against interception",
    ]) {
      const { source } = stanceOf(claim, "rfc7636");
      assert.equal(source.stance, "contradicts", claim);
      assert.equal(source.negation, true, claim);
    }
  });

  await test("negation: cue far from keywords does not flip", () => {
    const { source } = stanceOf(
      "PKCE protects OAuth public clients against authorization code interception attacks " +
        "and the reviewer does not like the color blue in any way whatsoever",
      "rfc7636",
    );
    assert.equal(source.stance, "supports");
    assert.equal(source.negation, undefined);
  });

  await test("negation: qualifies is flagged but not flipped", () => {
    const extra = [synthSeed("qual-1", "qualifies", 5, { pattern: ["zorbian", "recommend", "oauth"] })];
    const { source } = stanceOf(
      "Zorbian is not recommended for OAuth clients",
      "qual-1",
      extra,
    );
    assert.equal(source.stance, "qualifies");
    assert.equal(source.negation, true);
    assert.equal(source.stance_note, NEGATION_NOTE);
  });

  // ------------------------------------------------------------ contradiction
  await test("contradiction: both sides surface as a conflict", () => {
    const v = verifyClaim("PKCE is only for mobile apps");
    const byId = Object.fromEntries(v.sources.map((s) => [s.id, s.stance]));
    assert.equal(byId["rfc7636"], "contradicts");
    assert.equal(byId["oauth-bcp"], "contradicts");
    assert.equal(byId["blog-2019-pkce-mobile"], "supports");
    const contra = v.conflicts.find((c) => c.type === "contradiction");
    assert.ok(contra, "expected a contradiction conflict");
    assert.ok(contra.sources.includes("rfc7636"));
    assert.ok(contra.sources.includes("blog-2019-pkce-mobile"));
  });

  // ------------------------------------------------------------ supersession
  await test("supersession: relied-upon superseded source raises outdated", () => {
    const v = verifyClaim("The implicit flow is fine for single-page apps");
    const so = v.sources.find((s) => s.id === "so-answer-2021");
    assert.ok(so);
    assert.equal(so.stance, "supports");
    assert.equal(so.freshness, "superseded");
    const outdated = v.conflicts.find((c) => c.type === "outdated");
    assert.ok(outdated, "expected an outdated conflict");
    assert.deepEqual(outdated.sources, ["so-answer-2021"]);
  });

  // ------------------------------------------------------ irrelevant overlap
  await test("irrelevant keyword overlap: retrieved but unrelated", () => {
    const { source } = stanceOf("OAuth tokens expire after one hour", "rfc7636");
    assert.equal(source.stance, "unrelated");
    assert.match(source.match_explain, /Retrieved by keyword overlap/);
  });

  // ---------------------------------------------------------- confidence math
  await test("confidence: no retrieval hits -> 0 unsupported", () => {
    const v = verifyClaim("xyzzy plugh qqqqq");
    assert.deepEqual(v.sources, []);
    assert.equal(v.confidence.value, 0);
    assert.equal(v.confidence.level, "unsupported");
  });

  await test("confidence: two earned-10 supporters -> 100", () => {
    const extra = [
      synthSeed("syn-a", "supports", 10),
      synthSeed("syn-b", "supports", 10, { pattern: ["zorbian", "quantum"] }),
    ];
    const v = verifyClaim("Zorbian flarnets require quantum pickles", 6, extra);
    assert.equal(v.confidence.value, 100);
    assert.equal(v.confidence.level, "well supported");
  });

  await test("confidence: stale penalty on superseded reliance", () => {
    const extra = [
      synthSeed("syn-c", "supports", 10, {
        pattern: ["zorbian", "stale", "require"],
        supersededBy: "syn-b",
      }),
    ];
    const v = verifyClaim("Zorbian stale require", 6, extra);
    // support = min(1, 1.0/2) = 0.5; stale = 0.2 -> 0.5 - 0.2 = 0.3 -> 30
    assert.equal(v.confidence.value, 30);
    assert.equal(v.confidence.level, "contested");
    assert.ok(v.conflicts.some((c) => c.type === "outdated"));
  });

  await test("confidence: all-contradict -> 0 unsupported", () => {
    const v = verifyClaim("PKCE is only for mobile apps");
    assert.equal(v.confidence.value, 0);
    assert.equal(v.confidence.level, "unsupported");
  });

  // -------------------------------------------------------------- determinism
  await test("determinism: same claim twice -> byte-identical", () => {
    const claim =
      "PKCE protects OAuth public clients against authorization code interception attacks";
    const a = JSON.stringify(verifyClaim(claim));
    const b = JSON.stringify(verifyClaim(claim));
    assert.equal(a, b);
  });

  // ------------------------------------------------------------------ report
  console.log(`\n${passed} passing, ${failed} failing`);
  if (failed) {
    console.error("failing:", failures.join(", "));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("suite crashed:", e);
  process.exit(1);
});
