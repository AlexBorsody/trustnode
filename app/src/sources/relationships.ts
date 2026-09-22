import { UUID } from "@/packs/model";

export const relations = ["cites", "corroborates", "contradicts", "supersedes"] as const;
export type Relation = typeof relations[number];
export interface EvidenceBody {
  source_id: string; target_id: string; relation: Relation; rationale: string;
  claim_scope: string; source_locator: string; source_quote: string;
  target_locator: string; target_quote: string; observed_on: string;
  origin?: "manual-proposal"; source_url?: string; target_url?: string;
}
export interface EvidenceRevision { id: string; edge_id: string; revision: number; previous_revision_id: string | null; body: EvidenceBody; created_at: string }
export interface EvidenceReview { id: number; revision_id: string; author_id: string | null; action: string; reason: string; locator: string; excerpt: string; challenge_id: number | null; created_at: string }
export interface Relationship { id: string; template_version_id: string; author_id: string | null; created_at: string; current_revision: EvidenceRevision; current_decision: EvidenceReview | null }

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected evidence details.");
  return value as Record<string, unknown>;
}
export function evidenceId(value: unknown) {
  if (typeof value !== "string" || !UUID.test(value)) throw new Error("Choose an existing template or evidence record.");
  return value.toLowerCase();
}
function text(body: Record<string, unknown>, key: string, max: number, required = true) {
  const value = body[key] ?? "";
  if (typeof value !== "string" || value.trim().length > max || (required && !value.trim())) throw new Error(`Check ${key.replaceAll("_", " ")}.`);
  return value.trim();
}
export function parseRelationship(value: unknown) {
  const input = object(value), body = object(input.evidence);
  const relation = body.relation as Relation;
  if (!relations.includes(relation)) throw new Error("Choose the relationship type.");
  const source_id = evidenceId(body.source_id), target_id = evidenceId(body.target_id);
  if (source_id === target_id) throw new Error("Choose two different sources.");
  const observed_on = text(body, "observed_on", 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(observed_on) || !Number.isFinite(Date.parse(observed_on)) || new Date(observed_on).toISOString().slice(0, 10) !== observed_on) throw new Error("Enter a valid observation date.");
  const evidence: EvidenceBody = { source_id, target_id, relation, observed_on,
    rationale: text(body, "rationale", 2000), claim_scope: text(body, "claim_scope", 1000, relation !== "cites"),
    source_locator: text(body, "source_locator", 1000), source_quote: text(body, "source_quote", 2000, false),
    target_locator: text(body, "target_locator", 1000, relation !== "cites"), target_quote: text(body, "target_quote", 2000, false) };
  const edge_id = input.edge_id == null ? null : evidenceId(input.edge_id);
  const previous_revision_id = input.previous_revision_id == null ? null : evidenceId(input.previous_revision_id);
  if (Boolean(edge_id) !== Boolean(previous_revision_id)) throw new Error("Revisions require the evidence version you opened.");
  return { template_version_id: evidenceId(input.template_version_id), edge_id, previous_revision_id, evidence };
}
function reviewId(value: unknown) {
  if (value == null) return null;
  if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new Error("Invalid review reference.");
  return value as number;
}
export function parseEvidenceReview(value: unknown) {
  const input = object(value), action = text(input, "action", 20);
  if (!["accept", "reject", "withdraw", "challenge", "uphold", "dismiss"].includes(action)) throw new Error("Choose a review action.");
  if (action === "accept" && input.evidence_reviewed !== true) throw new Error("Confirm that you reviewed the captured evidence.");
  const challenge_id = reviewId(input.challenge_id);
  if (["uphold", "dismiss"].includes(action) && !challenge_id) throw new Error("Choose the challenge to resolve.");
  return { action, reason: text(input, "reason", 2000), expected_decision_id: reviewId(input.expected_decision_id),
    evidence_reviewed: input.evidence_reviewed === true, locator: text(input, "locator", 1000, action === "challenge"),
    excerpt: text(input, "excerpt", 2000, action === "challenge"), challenge_id };
}
