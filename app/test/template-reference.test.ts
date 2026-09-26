import assert from "node:assert/strict";
import { test } from "node:test";
import { compareReference, type ReferenceCandidate, type ReferenceInput } from "../src/packs/template-reference";
process.env.SUPABASE_URL = "https://reference-fixture.invalid";
process.env.SUPABASE_ANON_KEY = "fixture-public-key-not-a-secret";
const run = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const candidate = (id: string, sites: string[]): ReferenceCandidate => ({ id, pack_id: "candidate-pack", content_hash: "b".repeat(64), pack_revision: 4, created_at: "2026-09-25T00:00:00Z", title: id, owner_id: "owner", is_public: true, visibility_epoch: 1, category: "Fixture", category_id: "other-category", policy_version: "accepted-edges-v1", seed_mode: "uniform-seeds-v1", site_ids: sites, unmapped_resources: 1 });
const input = (): ReferenceInput => ({ reference: { run_id: run, input_hash: "a".repeat(64), output_hash: "c".repeat(64), pack_id: "reference-pack", template_version_id: "reference-version", category: "Fixture", category_id: "ref-category", policy_version: "accepted-edges-v1", algorithm: { methodology: "graph-trust-v1", implementation: "graph-trust-v1.0.0" }, completed_at: "2026-09-25T00:00:00Z", visibility_epoch: 1, site_evidence_state: "propagated", stale: false, public_readable: true }, site_scores: [{ id: "x", mass: .1 }, { id: "y", mass: .3 }, { id: "z", mass: .6 }, { id: "zero", mass: 0 }], templates: [], has_more: false });
test("reference median uses distinct known sites, even median, partial and zero coverage, and stable ties", () => {
  const body = input(); body.templates = [candidate("b", ["y", "x", "x", "missing"]), candidate("a", ["x", "y"]), candidate("c", ["unknown"]), candidate("d", []), candidate("e", ["zero"]), candidate("f", ["x", "z", "y"])];
  const result = compareReference(body);
  assert.deepEqual(result.map(t => t.id), ["f", "a", "b", "e", "c", "d"]);
  assert.equal(result[0].median_site_mass, .3); assert.equal(result[1].median_site_mass, .2);
  assert.equal(result[2].mapped_sites, 2); assert.equal(result[2].total_sites, 3); assert.equal(result[2].sites.find(s => s.id === "missing")?.mass, null);
  assert.equal(result[3].median_site_mass, 0); assert.equal(result[4].median_site_mass, null); assert.equal(result[5].total_sites, 0);
  assert.equal(result[2].unmapped_resources, 1); assert.equal(result[2].same_category_identity, false);
  assert.deepEqual(compareReference({ ...body, templates: [...body.templates].reverse(), site_scores: [...body.site_scores].reverse() }), result);
  assert.throws(() => compareReference({ ...body, templates: [{ ...body.templates[0], pack_id: "reference-pack" }] }));
});
test("reference API pins the whole cohort, reauthorizes pages/export and refuses changed scope or hidden reference", async () => {
  const saved = globalThis.fetch; let mode = "ok", calls = 0;
  const body = input(); body.templates = Array.from({ length: 25 }, (_, i) => candidate(String(i).padStart(2, "0"), ["x"]));
  globalThis.fetch = async (url, init) => {
    const req = new Request(url, init);
    if (req.url.endsWith("/user")) return new Response(JSON.stringify({ id: run }));
    calls++;
    if (mode === "hidden") return new Response('{"code":"PT404","message":"private reference ID"}', { status: 404 });
    if (mode === "incomplete") return new Response('{"code":"PT409"}', { status: 409 });
    const result = structuredClone(body);
    if (mode === "scope") result.templates[0].visibility_epoch++;
    if (mode === "method") result.reference.algorithm.implementation = "different";
    return new Response(JSON.stringify(result));
  };
  try {
    const { GET } = await import("../src/app/api/templates/compare/route"), { GET: EXPORT } = await import("../src/app/api/templates/compare/export/route");
    const req = (query = "") => new Request(`https://example.org/api/templates/compare?reference=${run}${query}`);
    const response = await GET(req()); assert.equal(response.status, 200); assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    const first = await response.json(); assert.equal(first.templates.length, 12); assert.equal(first.scope.count, 25);
    const next = await (await GET(req(`&cursor=${first.next_cursor}`))).json(); assert.equal(next.templates[0].id, "12");
    const params = `&input_hash=${first.reference.input_hash}&scope_hash=${first.scope.hash}`;
    assert.equal((await EXPORT(req())).status, 400);
    const download = await EXPORT(req(params)); assert.equal(download.status, 200); assert.equal(download.headers.get("Vary"), "Authorization");
    const exported = await download.json(); assert.equal(exported.templates.length, 25); assert.equal(exported.metric, "median-site-authority-v1"); assert.equal(exported.reference.input_hash, first.reference.input_hash); assert.equal(exported.scope.hash, first.scope.hash);
    assert.equal((await GET(req(`&cursor=${first.next_cursor}&category=Changed`))).status, 400);
    mode = "scope"; assert.equal((await GET(req(`&cursor=${first.next_cursor}`))).status, 409); assert.equal((await EXPORT(req(params))).status, 409);
    mode = "method"; assert.equal((await EXPORT(req(params))).status, 409);
    mode = "hidden"; const before = calls; const hidden = await EXPORT(req(params)); assert.equal(hidden.status, 404); assert(!(await hidden.text()).includes("private reference ID")); assert.equal(calls, before + 1);
    assert.equal((await GET(req(`&cursor=${first.next_cursor}`))).status, 404);
    mode = "incomplete"; assert.equal((await GET(req())).status, 409);
  } finally { globalThis.fetch = saved; }
});
