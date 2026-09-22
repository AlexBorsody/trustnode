/** No request, DB, model or clock state belongs in these computation contracts. */
export const GRAPH_TRUST_V1 = Object.freeze({
  methodology: "graph-trust-v1", implementation: "graph-trust-v1.0.0",
  damping: 0.85, tolerance: 1e-6, max_iterations: 100,
  max_nodes: 1000, max_edges: 10000, max_relationships: 10000,
  canonical_decimals: 12,
} as const);
export type ProjectionKind = "resource" | "site";
export interface EvidenceReference { edge_id: string; revision_id: string; decision_id: number }
export interface GraphNode { id: string; seed_weight: number }
export interface GraphEdge { source: string; target: string; evidence: EvidenceReference[] }
export interface GraphProjection { kind: ProjectionKind; nodes: GraphNode[]; edges: GraphEdge[] }
export type ExclusionReason = "unaccepted" | "non_propagating_relation" | "out_of_scope" | "unmapped_site" | "self_edge" | "duplicate_pair";
export interface EdgeExclusion {
  edge_id: string; revision_id: string; source_id: string; target_id: string;
  relation: string; reason: ExclusionReason;
}
export interface ProjectedGraph extends GraphProjection {
  exclusions: EdgeExclusion[];
  unmapped_resources: string[];
}
export interface TemplateGraph {
  schema_version: "graph-input-v1";
  template_version_id: string; template_content_hash: string; category_id: string;
  policy_version: "accepted-edges-v1";
  seed_mode: "uniform-seeds-v1" | "ordered-seeds-v1";
  relationship_count: number;
  resource: ProjectedGraph; site: ProjectedGraph;
}
export interface IncomingContribution {
  source_id: string; amount: number; evidence: EvidenceReference[];
}
export interface NodeScore {
  node_id: string;
  mass: number; canonical_mass: number; display_index: number;
  seed_mass: number; previous_mass: number;
  contributions: {
    direct_seed: number; incoming: IncomingContribution[];
    incoming_total: number; dangling: number; total: number;
  };
}
export interface TrustResult {
  algorithm: typeof GRAPH_TRUST_V1;
  projection: ProjectionKind;
  status: "completed" | "not_converged";
  evidence_state: "seed_only" | "propagated" | "no_seed_reachable_edges";
  scores: NodeScore[];
  ranking: string[];
  diagnostics: {
    iterations: number; residual: number; total_mass: number; mass_error: number;
    node_count: number; edge_count: number; seed_count: number;
    dangling_count: number; previous_dangling_mass: number;
    max_seed_mass: number; seed_concentration: number;
  };
}
export type GraphErrorCode = "invalid_input" | "unsupported_method" | "input_limit" | "duplicate_identity" | "missing_node" | "invalid_weight" | "empty_seeds" | "scope_mismatch" | "invalid_evidence" | "numerical_failure";
export class GraphInputError extends Error {
  constructor(public readonly code: GraphErrorCode, message: string) {
    super(message);
    this.name = "GraphInputError";
  }
}
export function requireGraph(condition: unknown, code: GraphErrorCode, message: string): asserts condition {
  if (!condition) throw new GraphInputError(code, message);
}
/** Code-unit order is locale independent. All sums use this same order. */
export const compareId = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
export function validId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
}
export const roundCanonical = (value: number) => Number(value.toFixed(GRAPH_TRUST_V1.canonical_decimals));
