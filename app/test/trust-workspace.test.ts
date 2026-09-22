import assert from "node:assert/strict";
import { test } from "node:test";
import { compareRuns, safeSourceUrl, validateBundle, type RunBundle } from "../src/trust/model";
import { computeArtifact, sha256, type FrozenInput } from "../src/trustnode/runs/artifact";
import { GRAPH_TRUST_V1 } from "../src/trustnode/graph";
function fixture(extra = false): RunBundle {
  const input: FrozenInput = {
    schema_version: "trust-snapshot-v1", captured_public: false, pack_revision: 1, visibility_epoch: 1,
    algorithm: GRAPH_TRUST_V1, relationships: [], reviews: [],
    template: { id: "template-1", pack_id: "pack-1", pack_revision: 1, evidence_revision: 1, content_hash: "a".repeat(64), created_at: "2026-09-22",
      snapshot: { schema_version: "seed-template-v1", policy_version: "accepted-edges-v1", title: "Synthetic fixture", description: "", category: "Fixture",
        category_id: "fixture", category_key: "fixture", owner_id: "fixture-owner", tags: [], pack_revision: 1, seed_mode: "uniform-seeds-v1",
        entries: ["a", ...(extra ? ["b"] : [])].map((id, index) => ({ source_id: id, title: `Fixture ${id}`, url: `https://${id}.example/fixture`, normalized_url: null,
          site_id: `site-${id}`, site_host: `${id}.example`, status: "ready", rank: index + 1, note: "", is_seed: index === 0, rationale: "Synthetic seed" })) } },
  };
  const text = JSON.stringify(input), inputHash = sha256(text);
  const artifact = computeArtifact(text, inputHash, { node: "v22.23.2", v8: "fixture", platform: "fixture", arch: "fixture", implementation: GRAPH_TRUST_V1.implementation });
  return { input, artifact: artifact.raw, status: { run_id: extra ? "run-b" : "run-a", state: "completed", failure_code: null,
    input_hash: inputHash, output_hash: artifact.output_hash, template_version_id: input.template.id, pack_revision: 1, evidence_revision: 1, stale: false, published: false } };
}
test("comparison identifies scope changes before differences and keeps missing distinct from zero", () => {
  const a = fixture(), b = fixture(true), same = compareRuns(a, a, "resource"), different = compareRuns(a, b, "resource");
  assert(same.same_input && same.same_graph && same.same_policy && same.same_seeds); assert.equal(same.rows[0].delta, 0);
  assert.equal(different.same_graph, false); assert.equal(different.same_input, false);
  assert.deepEqual(different.rows.find(r => r.id === "b"), { id: "b", left: null, right: 0, delta: null });
  b.artifact.graph.category_id = "other-category"; assert.equal(compareRuns(a, b, "site").same_category, false);
});
test("a view refuses mixed run/artifact identities and unsafe source links", () => {
  const a = fixture(), b = fixture(true);
  assert.equal(validateBundle(a.status.run_id, a.status, a.input, a.artifact).status.run_id, a.status.run_id);
  assert.throws(() => validateBundle("another-run", a.status, a.input, a.artifact));
  assert.throws(() => validateBundle(a.status.run_id, a.status, a.input, b.artifact));
  assert.equal(safeSourceUrl("javascript:alert(1)"), null); assert.equal(safeSourceUrl("https://example.org/record"), "https://example.org/record");
});
