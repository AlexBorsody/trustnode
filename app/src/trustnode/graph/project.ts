import type { TemplateVersion } from "../../packs/templates";
import type { Relationship } from "../../sources/relationships";
import { compareId, GRAPH_TRUST_V1, requireGraph, validId } from "./types";
import type { EdgeExclusion, EvidenceReference, GraphEdge, ProjectedGraph, TemplateGraph } from "./types";

/**
 * Adapt a COMPLETE, consistently captured set of current relationship summaries.
 * This does not fetch pages, establish visibility, or prove a decision is current.
 * The snapshot transaction (step 4) owns those responsibilities; never pass one
 * page of the relationships endpoint and call it a complete graph.
 */
export function projectTemplate(template: TemplateVersion, relationships: readonly Relationship[]): TemplateGraph {
  const snapshot = template?.snapshot;
  requireGraph(snapshot?.schema_version === "seed-template-v1" && snapshot.policy_version === "accepted-edges-v1",
    "unsupported_method", "Unsupported template or edge policy.");
  requireGraph(snapshot.seed_mode === "uniform-seeds-v1" || snapshot.seed_mode === "ordered-seeds-v1",
    "unsupported_method", "Unsupported seed weighting method.");
  requireGraph(validId(template.id) && validId(snapshot.category_id) && /^[a-f0-9]{64}$/.test(template.content_hash),
    "invalid_input", "Template identity and content hash are required.");
  requireGraph(Array.isArray(snapshot.entries) && snapshot.entries.length > 0, "invalid_input", "Template members are required.");
  requireGraph(snapshot.entries.length <= GRAPH_TRUST_V1.max_nodes, "input_limit", "Too many template members.");
  requireGraph(Array.isArray(relationships), "invalid_input", "A complete relationship array is required.");
  requireGraph(relationships.length <= GRAPH_TRUST_V1.max_relationships, "input_limit", "Too many relationship records; no sampling is performed.");

  const members = new Map<string, typeof snapshot.entries[number]>();
  const hosts = new Map<string, string>(), hostIds = new Map<string, string>();
  const ranks = new Set<number>();
  for (const entry of snapshot.entries) {
    requireGraph(entry && validId(entry.source_id) && typeof entry.is_seed === "boolean" && Number.isSafeInteger(entry.rank) && entry.rank > 0,
      "invalid_input", "Invalid template member identity, rank or seed flag.");
    requireGraph(!members.has(entry.source_id) && !ranks.has(entry.rank), "duplicate_identity", "Duplicate template member or rank.");
    members.set(entry.source_id, entry); ranks.add(entry.rank);
    if (entry.site_id !== null) {
      requireGraph(validId(entry.site_id) && typeof entry.site_host === "string" && entry.site_host.length > 0 && entry.site_host.length <= 253,
        "invalid_input", "Invalid captured site mapping.");
      requireGraph((!hosts.has(entry.site_id) || hosts.get(entry.site_id) === entry.site_host) &&
        (!hostIds.has(entry.site_host) || hostIds.get(entry.site_host) === entry.site_id), "duplicate_identity", "Conflicting captured site identities.");
      hosts.set(entry.site_id, entry.site_host); hostIds.set(entry.site_host, entry.site_id);
    } else requireGraph(entry.site_host === null, "invalid_input", "An unmapped resource cannot claim a site host.");
  }
  const seeds = [...members.values()].filter(e => e.is_seed).sort((a, b) => a.rank - b.rank || compareId(a.source_id, b.source_id));
  requireGraph(seeds.length > 0, "empty_seeds", "Choose at least one seed; uniform fallback is forbidden.");
  const resourceWeights = new Map<string, number>(), siteWeights = new Map<string, number>();
  seeds.forEach((seed, index) => {
    const weight = snapshot.seed_mode === "ordered-seeds-v1" ? 1 / (index + 1) : 1;
    resourceWeights.set(seed.source_id, weight);
    if (seed.site_id) siteWeights.set(seed.site_id, Math.max(siteWeights.get(seed.site_id) ?? 0, weight));
  });
  requireGraph(siteWeights.size > 0, "empty_seeds", "The site projection needs a seed with a captured site identity.");
  const resource: ProjectedGraph = {
    kind: "resource", nodes: [...members.keys()].sort(compareId).map(id => ({ id, seed_weight: resourceWeights.get(id) ?? 0 })),
    edges: [], exclusions: [], unmapped_resources: [],
  };
  const site: ProjectedGraph = {
    kind: "site", nodes: [...hosts.keys()].sort(compareId).map(id => ({ id, seed_weight: siteWeights.get(id) ?? 0 })),
    edges: [], exclusions: [], unmapped_resources: [...members.values()].filter(e => !e.site_id).map(e => e.source_id).sort(compareId),
  };
  const pairs = { resource: new Map<string, GraphEdge>(), site: new Map<string, GraphEdge>() };
  const edgeIds = new Set<string>(), revisionIds = new Set<string>(), decisionIds = new Set<number>();
  // Validate before sorting: invalid IDs must not enter identity comparisons.
  for (const edge of relationships) {
    requireGraph(edge && validId(edge.id) && edge.current_revision && validId(edge.current_revision.id), "invalid_evidence", "Invalid evidence identity.");
    requireGraph(!edgeIds.has(edge.id) && !revisionIds.has(edge.current_revision.id), "duplicate_identity", "Provide each current relationship exactly once.");
    edgeIds.add(edge.id); revisionIds.add(edge.current_revision.id);
    requireGraph(edge.template_version_id === template.id, "scope_mismatch", "Evidence belongs to a different template version.");
    const revision = edge.current_revision, body = revision.body, decision = edge.current_decision;
    requireGraph(revision.edge_id === edge.id && Number.isSafeInteger(revision.revision) && revision.revision > 0 && body &&
      validId(body.source_id) && validId(body.target_id) && ["cites", "corroborates", "contradicts", "supersedes"].includes(body.relation),
      "invalid_evidence", "Invalid current evidence revision.");
    if (decision) {
      requireGraph(Number.isSafeInteger(decision.id) && decision.id > 0 && !decisionIds.has(decision.id) &&
        decision.revision_id === revision.id && ["accept", "reject", "withdraw"].includes(decision.action),
        "invalid_evidence", "A decision must target the current revision; challenges are separate events.");
      decisionIds.add(decision.id);
    }
  }
  for (const edge of [...relationships].sort((a, b) => compareId(a.id, b.id))) {
    const revision = edge.current_revision, body = revision.body, decision = edge.current_decision;
    const exclude = (graph: ProjectedGraph, reason: EdgeExclusion["reason"]) => graph.exclusions.push({
      edge_id: edge.id, revision_id: revision.id, source_id: body.source_id, target_id: body.target_id, relation: body.relation, reason,
    });
    const source = members.get(body.source_id), target = members.get(body.target_id);
    const reason = !source || !target ? "out_of_scope" : decision?.action !== "accept" ? "unaccepted"
      : body.relation === "contradicts" || body.relation === "supersedes" ? "non_propagating_relation" : null;
    if (reason) { exclude(resource, reason); exclude(site, reason); continue; }
    const evidence: EvidenceReference = { edge_id: edge.id, revision_id: revision.id, decision_id: decision!.id };
    for (const graph of [resource, site]) {
      const from = graph.kind === "site" ? source!.site_id : body.source_id;
      const to = graph.kind === "site" ? target!.site_id : body.target_id;
      if (!from || !to) { exclude(graph, "unmapped_site"); continue; }
      if (from === to) { exclude(graph, "self_edge"); continue; }
      const key = JSON.stringify([from, to]), existing = pairs[graph.kind].get(key);
      if (existing) { existing.evidence.push({ ...evidence }); exclude(graph, "duplicate_pair"); }
      else pairs[graph.kind].set(key, { source: from, target: to, evidence: [{ ...evidence }] });
    }
  }
  for (const graph of [resource, site]) {
    graph.edges = [...pairs[graph.kind].values()].sort((a, b) => compareId(a.source, b.source) || compareId(a.target, b.target));
    requireGraph(graph.edges.length <= GRAPH_TRUST_V1.max_edges, "input_limit", "Too many eligible pairs; no sampling is performed.");
  }
  return {
    schema_version: "graph-input-v1", template_version_id: template.id, template_content_hash: template.content_hash,
    category_id: snapshot.category_id, policy_version: snapshot.policy_version, seed_mode: snapshot.seed_mode,
    relationship_count: relationships.length, resource, site,
  };
}
