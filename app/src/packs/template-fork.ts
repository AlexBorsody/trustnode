import { UUID } from "./model";
export interface ForkInfo {
  version_id: string; content_hash: string; evidence_revision: number; visibility_epoch: number;
  evidence_count: number; accepted_count: number; copy_limit: number; copy_supported: boolean;
  origin: { version_id: string; pack_id: string; title: string; owner_id: string;
    pack_revision: number; evidence_revision: number } | null;
}
export interface ForkInput {
  content_hash: string; evidence_revision: number; visibility_epoch: number;
  copy_evidence: boolean; title: string; request_key: string;
}
export interface ForkResult { pack_id: string; version_id: string; copied_evidence: number; reused: boolean }
export function parseTemplateFork(value: unknown): ForkInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Supply the selected template and fork choice.");
  const body = value as Record<string, unknown>;
  if (typeof body.content_hash !== "string" || !/^[0-9a-f]{64}$/.test(body.content_hash) ||
    !Number.isSafeInteger(body.evidence_revision) || (body.evidence_revision as number) < 1 ||
    !Number.isSafeInteger(body.visibility_epoch) || (body.visibility_epoch as number) < 1 ||
    typeof body.copy_evidence !== "boolean" || typeof body.request_key !== "string" || !UUID.test(body.request_key) ||
    typeof body.title !== "string" || !body.title.trim() || body.title.trim().length > 120) throw new Error("Supply captured revisions, an explicit evidence choice and a title of 1–120 characters.");
  return { content_hash: body.content_hash, evidence_revision: body.evidence_revision as number,
    visibility_epoch: body.visibility_epoch as number, copy_evidence: body.copy_evidence,
    title: body.title.trim(), request_key: body.request_key.toLowerCase() };
}
