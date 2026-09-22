import assert from "node:assert/strict";
import { test } from "node:test";
import type { TemplateEntry, TemplateVersion } from "../src/packs/templates";
import { seedDistribution } from "../src/packs/templates";
import type { Relationship } from "../src/sources/relationships";
import {
  canonicalProjection, computeSeedComponent, computeTrust, GRAPH_TRUST_V1, GraphInputError,
  largestContributions, projectTemplate, serializeProjection, serializeTrustResult,
  type GraphErrorCode, type GraphProjection,
} from "../src/trustnode/graph";

// Synthetic, hand-computable fixtures; no claim of real site endorsement.
const member = (source_id: string, site_id: string | null, rank: number, is_seed = false): TemplateEntry => ({
  source_id, site_id, site_host: site_id ? `${site_id}.example` : null, rank, is_seed,
  title: source_id, url: `https://${site_id ?? "unmapped"}.example/${source_id}`, normalized_url: null,
  note: "", rationale: is_seed ? "Synthetic fixture seed" : "", status: "ready",
});
function template(entries = [member("a", "one", 1, true), member("b", "two", 2), member("c", "three", 3)]): TemplateVersion {
  return {
    id: "template-1", pack_id: "pack-1", pack_revision: 1, content_hash: "a".repeat(64), created_at: "2026-09-22",
    snapshot: { schema_version: "seed-template-v1", policy_version: "accepted-edges-v1", seed_mode: "uniform-seeds-v1",
      title: "Synthetic propagation fixture", description: "", category: "Fixture", category_id: "fixture-category",
      category_key: "fixture", owner_id: "fixture-owner", tags: [], pack_revision: 1, entries },
  };
}
function relationship(id: number, source_id = "a", target_id = "b", relation: Relationship["current_revision"]["body"]["relation"] = "cites", action: string | null = "accept"): Relationship {
  return {
    id: `edge-${id}`, template_version_id: "template-1", author_id: "fixture-owner", created_at: "2026-09-22",
    current_revision: { id: `revision-${id}`, edge_id: `edge-${id}`, revision: 1, previous_revision_id: null, created_at: "2026-09-22",
      body: { source_id, target_id, relation, rationale: "Synthetic fixture", claim_scope: "Fixture claim", source_locator: "Fixture section A",
        source_quote: "Synthetic source quote", target_locator: "Fixture section B", target_quote: "Synthetic target quote", observed_on: "2026-09-22" } },
    current_decision: action ? { id, revision_id: `revision-${id}`, author_id: "fixture-owner", action, reason: "Fixture decision",
      locator: "", excerpt: "", challenge_id: null, created_at: "2026-09-22" } : null,
  };
}
function close(actual: number, expected: number, epsilon = 1e-12) {
  assert(Math.abs(actual - expected) <= epsilon, `${actual} differs from ${expected}`);
}
function fails(code: GraphErrorCode, action: () => unknown) {
  assert.throws(action, error => error instanceof GraphInputError && error.code === code);
}

test("accepted seed-to-nonseed evidence propagates with exact final-update accounting", () => {
  const graph = projectTemplate(template(), [relationship(1)]);
  for (const projection of [graph.resource, graph.site]) {
    const result = computeTrust(projection), [a, b, c] = projection.kind === "resource"
      ? ["a", "b", "c"].map(id => result.scores.find(n => n.node_id === id)!)
      : ["one", "two", "three"].map(id => result.scores.find(n => n.node_id === id)!);
    // A -> B with dangling B returning to seed A: A=20/37, B=17/37.
    close(a.mass, 20 / 37, 1e-6); close(b.mass, 17 / 37, 1e-6); assert.equal(c.mass, 0);
    assert.equal(result.status, "completed"); assert.equal(result.evidence_state, "propagated");
    assert(result.diagnostics.residual <= 1e-6); assert(result.diagnostics.iterations <= 100);
    close(result.diagnostics.total_mass, 1);
    for (const score of result.scores) {
      assert.equal(score.contributions.total, score.mass);
      assert.equal(score.contributions.incoming.reduce((sum, c) => sum + c.amount, 0), score.contributions.incoming_total);
      assert.equal(score.mass, score.contributions.direct_seed + score.contributions.incoming_total + score.contributions.dangling);
    }
    close(a.contributions.direct_seed, 0.15);
    close(a.contributions.dangling, 0.85 * b.previous_mass);
    close(b.contributions.incoming_total, 0.85 * a.previous_mass);
    assert.equal(b.contributions.incoming[0].evidence[0].revision_id, "revision-1");
  }
});

test("site mass deduplicates seed pages while resource mass and internal citations stay separate", () => {
  const t = template([member("a", "one", 1, true), member("b", "one", 2, true), member("c", "two", 3, true), member("d", "three", 4)]);
  t.snapshot.seed_mode = "ordered-seeds-v1";
  const graph = projectTemplate(t, [relationship(1, "a", "b"), relationship(2, "a", "d"), relationship(3, "b", "d", "corroborates")]);
  const resources = computeTrust(graph.resource), sites = computeTrust(graph.site), preview = seedDistribution(t.snapshot.entries, t.snapshot.seed_mode);
  for (const seed of preview.resources) close(resources.scores.find(n => n.node_id === seed.id)!.seed_mass, seed.mass);
  for (const seed of preview.sites) close(sites.scores.find(n => n.node_id === seed.id)!.seed_mass, seed.mass);
  close(sites.scores.find(n => n.node_id === "one")!.seed_mass, 0.75);
  assert.equal(graph.resource.edges.length, 3); assert.equal(graph.site.edges.length, 1);
  assert.deepEqual(graph.site.edges[0].evidence.map(e => e.edge_id), ["edge-2", "edge-3"]);
  assert.deepEqual(graph.site.exclusions.map(e => e.reason), ["self_edge", "duplicate_pair"]);
  const uniform = projectTemplate({ ...t, snapshot: { ...t.snapshot, seed_mode: "uniform-seeds-v1" } }, []);
  close(computeTrust(uniform.site).scores.find(n => n.node_id === "one")!.seed_mass, 0.5);
  assert.notEqual(serializeTrustResult(sites), serializeTrustResult(computeTrust(uniform.site)));
});

test("policy keeps duplicate support and exclusions without promoting unaccepted or conflicting evidence", () => {
  const rows = [relationship(1), relationship(2, "a", "b", "corroborates"), relationship(3, "a", "c", "contradicts"),
    relationship(4, "a", "c", "supersedes"), relationship(5, "a", "c", "cites", null), relationship(6, "a", "c", "cites", "reject"),
    relationship(7, "a", "c", "cites", "withdraw"), relationship(8, "a", "outside"), relationship(9, "a", "a")];
  const graph = projectTemplate(template(), rows);
  assert.equal(graph.resource.edges.length, 1); assert.equal(graph.resource.edges[0].evidence.length, 2);
  assert.deepEqual(graph.resource.exclusions.map(e => e.reason), ["duplicate_pair", "non_propagating_relation", "non_propagating_relation", "unaccepted", "unaccepted", "unaccepted", "out_of_scope", "self_edge"]);
  const result = computeTrust(graph.resource), single = computeTrust(projectTemplate(template(), [rows[0]]).resource);
  assert.deepEqual(result.scores.map(s => s.mass), single.scores.map(s => s.mass));
  assert.equal(result.scores.find(s => s.node_id === "c")!.mass, 0);
  const changed = structuredClone(rows[0]); changed.current_revision.id = "revision-new"; changed.current_revision.revision = 2;
  changed.current_revision.previous_revision_id = "revision-1";
  fails("invalid_evidence", () => projectTemplate(template(), [changed]));
  changed.current_decision = null;
  assert.equal(computeTrust(projectTemplate(template(), [changed]).resource).evidence_state, "seed_only");
});

test("seed-only, unreachable components and unmapped sites remain explicit", () => {
  const t = template([member("a", "one", 1, true), member("b", null, 2), member("c", "three", 3)]);
  const seedOnly = computeTrust(projectTemplate(t, []).resource);
  assert.equal(seedOnly.evidence_state, "seed_only"); assert.deepEqual(seedOnly.scores.map(s => s.mass), [1, 0, 0]);
  assert.deepEqual(seedOnly.ranking, ["a", "b", "c"]);
  const disconnected = computeTrust(projectTemplate(t, [relationship(1, "b", "c")]).resource);
  assert.equal(disconnected.evidence_state, "no_seed_reachable_edges"); assert.deepEqual(disconnected.scores.map(s => s.mass), [1, 0, 0]);
  const graph = projectTemplate(t, [relationship(2)]);
  assert.deepEqual(graph.site.unmapped_resources, ["b"]); assert.equal(graph.site.exclusions[0].reason, "unmapped_site");
  assert(computeTrust(graph.resource).scores.find(s => s.node_id === "b")!.mass > 0);
  assert(!computeTrust(graph.site).scores.some(s => s.node_id === "b"));
});

test("input reordering replays byte-for-byte and per-seed components sum back to the full run", () => {
  const t = template([member("a", "one", 1, true), member("b", "two", 2, true), member("c", "three", 3), member("d", "four", 4)]);
  t.snapshot.seed_mode = "ordered-seeds-v1";
  const rows = [relationship(1), relationship(2, "b", "c"), relationship(3, "a", "c"), relationship(4, "c", "a"), relationship(5, "b", "d"), relationship(6, "a", "b")];
  const original = projectTemplate(t, rows), reversedTemplate = structuredClone(t);
  reversedTemplate.snapshot.entries.reverse();
  assert.deepEqual(projectTemplate(reversedTemplate, [...rows].reverse()), original);
  const shuffled: GraphProjection = { kind: "resource", nodes: [...original.resource.nodes].reverse(),
    edges: [...original.resource.edges].reverse().map(e => ({ ...e, evidence: [...e.evidence].reverse() })) };
  const result = computeTrust(original.resource);
  assert.deepEqual(computeTrust(shuffled), result);
  assert.equal(serializeProjection(shuffled), serializeProjection(original.resource));
  assert.equal(serializeTrustResult(computeTrust(shuffled)), serializeTrustResult(result));
  const components = ["a", "b"].map(id => computeSeedComponent(original.resource, id, result.diagnostics.iterations));
  result.scores.forEach((node, i) => close(components.reduce((sum, c) => sum + c.scores[i].mass, 0), node.mass));
  const c = result.scores.find(s => s.node_id === "c")!, preview = largestContributions(c, 1);
  assert.equal(preview.remainder.count, 1);
  close(preview.direct_seed + preview.dangling + preview.incoming[0].amount + preview.remainder.amount, c.mass);
  assert(!serializeTrustResult(result).includes("created_at"));
  assert.deepEqual(original.resource.nodes, canonicalProjection(original.resource).nodes);
});

test("invalid, duplicate, missing and oversized inputs fail explicitly without silently changing scope", () => {
  const graph = projectTemplate(template(), [relationship(1)]).resource;
  for (const seed_weight of [-1, NaN, Infinity]) fails("invalid_weight", () => computeTrust({ ...graph, nodes: [{ id: "a", seed_weight }] }));
  fails("invalid_weight", () => computeTrust({ ...graph, nodes: [{ id: "a", seed_weight: Number.MAX_VALUE }, { id: "b", seed_weight: Number.MIN_VALUE }] }));
  fails("empty_seeds", () => computeTrust({ kind: "site", nodes: [], edges: [] }));
  fails("empty_seeds", () => computeTrust({ ...graph, nodes: graph.nodes.map(n => ({ ...n, seed_weight: 0 })) }));
  fails("duplicate_identity", () => computeTrust({ ...graph, nodes: [...graph.nodes, graph.nodes[0]] }));
  fails("duplicate_identity", () => computeTrust({ ...graph, edges: [...graph.edges, graph.edges[0]] }));
  fails("missing_node", () => computeTrust({ ...graph, edges: [{ ...graph.edges[0], target: "missing" }] }));
  fails("input_limit", () => computeTrust({ ...graph, nodes: Array.from({ length: 1001 }, (_, i) => ({ id: `n${i}`, seed_weight: 1 })) }));
  fails("input_limit", () => computeTrust({ ...graph, edges: Array(10001).fill(graph.edges[0]) }));
  fails("input_limit", () => projectTemplate(template(), Array(10001).fill(relationship(1))));
  fails("duplicate_identity", () => projectTemplate(template(), [relationship(1), relationship(1)]));
  fails("scope_mismatch", () => projectTemplate(template(), [{ ...relationship(1), template_version_id: "another-template" }]));
  const invalidMethod = template(); invalidMethod.snapshot.policy_version = "other" as "accepted-edges-v1";
  fails("unsupported_method", () => projectTemplate(invalidMethod, []));
  const noSeeds = template(); noSeeds.snapshot.entries.forEach(e => { e.is_seed = false; });
  fails("empty_seeds", () => projectTemplate(noSeeds, []));
  fails("invalid_evidence", () => projectTemplate(template(), [relationship(1, "a", "b", "cites", "challenge")]));
  fails("invalid_input", () => computeSeedComponent(graph, "a", GRAPH_TRUST_V1.max_iterations + 1));
  fails("empty_seeds", () => computeSeedComponent(graph, "b", 1));
});
