import { createHash } from "node:crypto";
import { computeTrust, GRAPH_TRUST_V1, GraphInputError, projectTemplate, serializeTrustResult } from "../graph";
import type { TemplateVersion } from "../../packs/templates";
import type { EvidenceReview, Relationship } from "../../sources/relationships";

export class TrustConvergenceError extends Error {
  constructor(public readonly diagnostics: Record<string, unknown>) { super("not_converged"); }
}
export const MAX_ARTIFACT_BYTES = 2 * 1024 * 1024;
export interface FrozenInput {
  schema_version: "trust-snapshot-v1";
  template: TemplateVersion & { evidence_revision: number };
  relationships: Relationship[]; reviews: EvidenceReview[];
  pack_revision: number; visibility_epoch: number; captured_public: boolean;
  algorithm: typeof GRAPH_TRUST_V1;
}
export interface RuntimeIdentity { node: string; v8: string; platform: string; arch: string; implementation: string }
export const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
export function stableJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (!value || typeof value !== "object") throw new GraphInputError("invalid_input", "Invalid replay JSON.");
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
}
export function computeArtifact(inputText: string, inputHash: string, runtime: RuntimeIdentity) {
  if (Buffer.byteLength(inputText) > MAX_ARTIFACT_BYTES || sha256(inputText) !== inputHash) throw new GraphInputError("invalid_input", "Snapshot hash or byte limit failed.");
  const input: FrozenInput = JSON.parse(inputText);
  if (input.schema_version !== "trust-snapshot-v1" || stableJson(input.algorithm) !== stableJson(GRAPH_TRUST_V1) || runtime.node !== "v22.23.2" || runtime.implementation !== GRAPH_TRUST_V1.implementation) {
    throw new GraphInputError("unsupported_method", "Snapshot methodology or worker runtime is unsupported.");
  }
  const graph = projectTemplate(input.template, input.relationships);
  const results = { resource: computeTrust(graph.resource), site: computeTrust(graph.site) };
  if (results.resource.status !== "completed" || results.site.status !== "completed") throw new TrustConvergenceError({ resource: results.resource.diagnostics, site: results.site.diagnostics });
  const raw = { schema_version: "trust-artifact-v1", input_hash: inputHash, runtime, graph, results };
  const canonical = stableJson({ ...raw, results: {
    resource: JSON.parse(serializeTrustResult(results.resource)), site: JSON.parse(serializeTrustResult(results.site)),
  } });
  if (Buffer.byteLength(JSON.stringify(raw)) > MAX_ARTIFACT_BYTES || Buffer.byteLength(canonical) > MAX_ARTIFACT_BYTES) throw new GraphInputError("input_limit", "Result exceeds the stored artifact limit.");
  return { raw, canonical, output_hash: sha256(canonical) };
}
export function replayArtifact(inputText: string, canonical: string, outputHash: string) {
  if (sha256(canonical) !== outputHash) throw new Error("Stored output hash does not match.");
  const artifact = JSON.parse(canonical);
  const replay = computeArtifact(inputText, artifact.input_hash, artifact.runtime);
  return { matches: replay.canonical === canonical && replay.output_hash === outputHash, output_hash: replay.output_hash };
}
