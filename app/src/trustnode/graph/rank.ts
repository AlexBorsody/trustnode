import { compareId, GRAPH_TRUST_V1, requireGraph, roundCanonical, validId } from "./types";
import type { GraphProjection, IncomingContribution, NodeScore, TrustResult } from "./types";

/** Validate the normalized matrix boundary, including callers bypassing the template adapter. */
function prepare(input: GraphProjection) {
  requireGraph(input && (input.kind === "resource" || input.kind === "site") && Array.isArray(input.nodes) && Array.isArray(input.edges),
    "invalid_input", "Choose a site or resource graph with nodes and edges.");
  requireGraph(input.nodes.length <= GRAPH_TRUST_V1.max_nodes && input.edges.length <= GRAPH_TRUST_V1.max_edges,
    "input_limit", "Projection exceeds the node or edge limit.");
  const ids = new Set<string>();
  for (const node of input.nodes) {
    requireGraph(node && validId(node.id), "invalid_input", "Invalid graph node identity.");
    requireGraph(!ids.has(node.id), "duplicate_identity", "Duplicate node identity."); ids.add(node.id);
    requireGraph(Number.isFinite(node.seed_weight) && node.seed_weight >= 0, "invalid_weight", "Seed weights must be finite and nonnegative.");
  }
  const nodes = input.nodes.map(n => ({ id: n.id, seed_weight: n.seed_weight })).sort((a, b) => compareId(a.id, b.id));
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const seedTotal = nodes.reduce((sum, n) => sum + n.seed_weight, 0);
  requireGraph(Number.isFinite(seedTotal), "invalid_weight", "Seed weight total is not finite.");
  requireGraph(seedTotal > 0, "empty_seeds", "At least one positive seed is required; uniform fallback is forbidden.");
  const p = nodes.map(n => n.seed_weight / seedTotal);
  requireGraph(p.every((mass, i) => nodes[i].seed_weight === 0 || mass > 0), "invalid_weight", "Seed weights exceed representable relative precision.");
  const pairs = new Set<string>(), references = new Set<string>(), revisions = new Set<string>(), decisions = new Set<number>();
  let evidenceCount = 0;
  for (const edge of input.edges) {
    requireGraph(edge && validId(edge.source) && validId(edge.target), "invalid_input", "Invalid edge identity.");
    requireGraph(ids.has(edge.source) && ids.has(edge.target), "missing_node", "Every projected edge must reference included nodes.");
    const key = JSON.stringify([edge.source, edge.target]);
    requireGraph(edge.source !== edge.target && !pairs.has(key), "duplicate_identity", "Projected pairs must be distinct and cannot be self edges."); pairs.add(key);
    requireGraph(Array.isArray(edge.evidence) && edge.evidence.length > 0, "invalid_evidence", "Every eligible pair must retain accepted evidence references.");
    evidenceCount += edge.evidence.length;
    requireGraph(evidenceCount <= GRAPH_TRUST_V1.max_relationships, "input_limit", "Too many supporting relationship records.");
    for (const reference of edge.evidence) {
      requireGraph(reference && validId(reference.edge_id) && validId(reference.revision_id) && Number.isSafeInteger(reference.decision_id) && reference.decision_id > 0,
        "invalid_evidence", "Invalid accepted evidence reference.");
      requireGraph(!references.has(reference.edge_id) && !revisions.has(reference.revision_id) && !decisions.has(reference.decision_id),
        "duplicate_identity", "An evidence reference can support only one projected pair.");
      references.add(reference.edge_id); revisions.add(reference.revision_id); decisions.add(reference.decision_id);
    }
  }
  const edges = input.edges.map(e => ({ source: e.source, target: e.target,
    evidence: e.evidence.map(r => ({ edge_id: r.edge_id, revision_id: r.revision_id, decision_id: r.decision_id })).sort((a, b) => compareId(a.edge_id, b.edge_id)),
  })).sort((a, b) => compareId(a.source, b.source) || compareId(a.target, b.target));
  const outgoing = nodes.map(() => 0);
  const indexed = edges.map(edge => {
    const source = index.get(edge.source)!, target = index.get(edge.target)!;
    outgoing[source]++;
    return { source, target, edge };
  });
  return { nodes, edges, p, outgoing, indexed };
}
type Prepared = ReturnType<typeof prepare>;
const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

/** The same ordered arithmetic constructs iterations and the final contribution ledger. */
function update(graph: Prepared, previous: readonly number[], teleport = graph.p) {
  const incoming = graph.nodes.map(() => 0);
  let dangling = 0;
  for (let i = 0; i < previous.length; i++) if (graph.outgoing[i] === 0) dangling += previous[i];
  for (const edge of graph.indexed) {
    incoming[edge.target] += GRAPH_TRUST_V1.damping * (previous[edge.source] / graph.outgoing[edge.source]);
  }
  const direct = teleport.map(mass => (1 - GRAPH_TRUST_V1.damping) * mass);
  const redistributed = graph.p.map(mass => GRAPH_TRUST_V1.damping * dangling * mass);
  const next = direct.map((mass, i) => mass + incoming[i] + redistributed[i]);
  requireGraph(next.every(n => Number.isFinite(n) && n >= 0), "numerical_failure", "Graph iteration produced an invalid mass.");
  return { next, incoming, direct, redistributed, dangling };
}

export function computeTrust(input: GraphProjection): TrustResult {
  const graph = prepare(input);
  let current = graph.p.slice(), previous = current, iterations = 0, residual = Infinity;
  while (iterations < GRAPH_TRUST_V1.max_iterations) {
    previous = current;
    current = update(graph, previous).next;
    residual = sum(current.map((value, i) => Math.abs(value - previous[i])));
    iterations++;
    if (residual <= GRAPH_TRUST_V1.tolerance) break;
  }
  const final = update(graph, previous);
  const incoming: IncomingContribution[][] = graph.nodes.map(() => []);
  for (const { source, target, edge } of graph.indexed) incoming[target].push({
    source_id: edge.source,
    amount: GRAPH_TRUST_V1.damping * (previous[source] / graph.outgoing[source]),
    evidence: edge.evidence,
  });
  const maximum = Math.max(...current), totalMass = sum(current);
  requireGraph(Math.abs(totalMass - 1) <= 1e-10, "numerical_failure", "Graph iteration failed to conserve mass.");
  const scores: NodeScore[] = graph.nodes.map((node, i) => ({
    node_id: node.id, mass: current[i], canonical_mass: roundCanonical(current[i]),
    display_index: Math.round(100 * current[i] / maximum) / 10,
    seed_mass: graph.p[i], previous_mass: previous[i],
    contributions: {
      direct_seed: final.direct[i], incoming: incoming[i], incoming_total: final.incoming[i],
      dangling: final.redistributed[i], total: final.direct[i] + final.incoming[i] + final.redistributed[i],
    },
  }));
  const converged = residual <= GRAPH_TRUST_V1.tolerance;
  return {
    algorithm: GRAPH_TRUST_V1, projection: input.kind,
    status: converged ? "completed" : "not_converged",
    evidence_state: graph.edges.length === 0 ? "seed_only" : final.incoming.some(mass => mass > 0) ? "propagated" : "no_seed_reachable_edges",
    scores,
    // Failed convergence retains diagnostics/vectors, never a completed leaderboard.
    ranking: converged ? [...scores].sort((a, b) => b.mass - a.mass || compareId(a.node_id, b.node_id)).map(n => n.node_id) : [],
    diagnostics: {
      iterations, residual, total_mass: totalMass, mass_error: Math.abs(totalMass - 1),
      node_count: graph.nodes.length, edge_count: graph.edges.length, seed_count: graph.p.filter(mass => mass > 0).length,
      dangling_count: graph.outgoing.filter(count => count === 0).length, previous_dangling_mass: final.dangling,
      max_seed_mass: Math.max(...graph.p), seed_concentration: sum(graph.p.map(mass => mass * mass)),
    },
  };
}

/**
 * On-demand linear seed attribution, not another independently normalized rank.
 * Use the parent run's exact iteration count. Only initial/teleport mass is split;
 * dangling mass always returns to the original full p, so components add to t.
 */
export function computeSeedComponent(input: GraphProjection, seedId: string, iterations: number) {
  requireGraph(Number.isSafeInteger(iterations) && iterations >= 1 && iterations <= GRAPH_TRUST_V1.max_iterations,
    "invalid_input", "Use the parent run's bounded iteration count.");
  const graph = prepare(input), index = graph.nodes.findIndex(node => node.id === seedId);
  requireGraph(index >= 0 && graph.p[index] > 0, "empty_seeds", "Choose a positive seed from this projection.");
  const teleport = graph.p.map((mass, i) => i === index ? mass : 0);
  let current = teleport.slice();
  for (let step = 0; step < iterations; step++) current = update(graph, current, teleport).next;
  return { seed_id: seedId, iterations, scores: graph.nodes.map((node, i) => ({ node_id: node.id, mass: current[i] })) };
}

/** UI-sized explanation with an explicit remainder; full results retain every edge. */
export function largestContributions(score: NodeScore, limit = 5) {
  requireGraph(Number.isSafeInteger(limit) && limit >= 0 && limit <= GRAPH_TRUST_V1.max_edges, "invalid_input", "Invalid contribution limit.");
  const ordered = [...score.contributions.incoming].sort((a, b) => b.amount - a.amount || compareId(a.source_id, b.source_id));
  return {
    direct_seed: score.contributions.direct_seed, dangling: score.contributions.dangling,
    incoming: ordered.slice(0, limit),
    remainder: { count: Math.max(0, ordered.length - limit), amount: sum(ordered.slice(limit).map(c => c.amount)) },
    total: score.mass,
  };
}

/** Canonicalized matrix for replay/export; preparation rejects duplicate or missing identities. */
export function canonicalProjection(input: GraphProjection): GraphProjection {
  const graph = prepare(input);
  return { kind: input.kind, nodes: graph.nodes, edges: graph.edges };
}
