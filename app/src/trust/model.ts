import type { FrozenInput, computeArtifact } from "../trustnode/runs/artifact";
import type { NodeScore, ProjectionKind, TrustResult } from "../trustnode/graph";
export type Artifact = ReturnType<typeof computeArtifact>["raw"];
export interface RunStatus {
  run_id: string; state: "queued" | "running" | "completed" | "failed";
  failure_code: string | null; failure_diagnostics?: Record<string, unknown> | null;
  input_hash: string; output_hash: string | null; template_version_id: string;
  current_public?: boolean; public_readable?: boolean; pack_revision: number; evidence_revision: number; stale: boolean; published: boolean;
}
export interface RunBundle { status: RunStatus; input: FrozenInput; artifact: Artifact }
export function labelNode(bundle: RunBundle, projection: ProjectionKind, id: string) {
  const entries = bundle.input.template.snapshot.entries;
  return projection === "resource" ? entries.find(e => e.source_id === id)?.title ?? id : entries.find(e => e.site_id === id)?.site_host ?? id;
}
export function safeSourceUrl(value: string | null) {
  try { const url = new URL(value ?? ""); return ["http:", "https:"].includes(url.protocol) ? url.href : null; } catch { return null; }
}
export function compareRuns(left: RunBundle, right: RunBundle, projection: ProjectionKind) {
  const a = left.artifact.graph[projection], b = right.artifact.graph[projection];
  const graphIdentity = (g: typeof a) => JSON.stringify({ nodes: g.nodes.map(n => n.id), edges: g.edges,
    // Exclusions are part of the recorded graph evidence, too.
    exclusions: g.exclusions, unmapped: g.unmapped_resources });
  const seeds = (g: typeof a) => JSON.stringify(g.nodes.filter(n => n.seed_weight > 0));
  const leftScores = new Map(left.artifact.results[projection].scores.map(n => [n.node_id, n.mass]));
  const rightScores = new Map(right.artifact.results[projection].scores.map(n => [n.node_id, n.mass]));
  return {
    same_input: left.status.input_hash === right.status.input_hash,
    same_category: left.artifact.graph.category_id === right.artifact.graph.category_id,
    same_graph: graphIdentity(a) === graphIdentity(b),
    same_policy: left.artifact.graph.policy_version === right.artifact.graph.policy_version &&
      JSON.stringify(left.artifact.results[projection].algorithm) === JSON.stringify(right.artifact.results[projection].algorithm),
    same_seeds: seeds(a) === seeds(b),
    rows: [...new Set([...leftScores.keys(), ...rightScores.keys()])].sort().map(id => {
      const l = leftScores.get(id) ?? null, r = rightScores.get(id) ?? null;
      return { id, left: l, right: r, delta: l === null || r === null ? null : r - l };
    }),
  };
}
export function validateBundle(runId: string, status: RunStatus, input: FrozenInput, artifact: Artifact) {
  if (status.run_id !== runId || status.state !== "completed" || artifact.input_hash !== status.input_hash ||
    input.template.id !== status.template_version_id || artifact.graph.template_version_id !== input.template.id ||
    artifact.results.site.status !== "completed" || artifact.results.resource.status !== "completed") throw new Error("Run artifacts do not match. Reload this run.");
  return { status, input, artifact };
}
export function scoreRows(result: TrustResult): NodeScore[] {
  const lookup = new Map(result.scores.map(n => [n.node_id, n]));
  return result.ranking.flatMap(id => lookup.has(id) ? [lookup.get(id)!] : []);
}
