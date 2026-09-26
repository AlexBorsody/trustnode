import { UUID } from "./model";
import type { ForkInfo } from "./template-fork";
import type { SeedMode, TemplateEntry, TemplateVersion } from "./templates";
export interface MergeParent { version_id: string; content_hash: string; evidence_revision: number; visibility_epoch: number }
export interface MergeMember { source_id: string; metadata_version: string; is_seed: boolean; rationale: string }
export interface MergeInput {
  parents: MergeParent[]; metadata_version: string; title: string; seed_mode: SeedMode;
  entries: MergeMember[]; copy_evidence: boolean; request_key: string;
}
export interface MergeInfo { version: TemplateVersion; info: ForkInfo }
export function mergeRows(left: TemplateVersion, right: TemplateVersion) {
  const first = new Map(left.snapshot.entries.map(e => [e.source_id, e]));
  const second = new Map(right.snapshot.entries.map(e => [e.source_id, e]));
  return [...new Set([...first.keys(), ...second.keys()])].map(id => {
    const l = first.get(id), r = second.get(id);
    const metadata = (e: TemplateEntry) => [e.title,e.url,e.normalized_url,e.site_id,e.site_host,e.status,e.note];
    return { id, left: l, right: r, conflict: !!l && !!r && JSON.stringify(metadata(l)) !== JSON.stringify(metadata(r)) };
  });
}
export function parseTemplateMerge(value: unknown): MergeInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Supply a reconciled template.");
  const b = value as Record<string, unknown>;
  const uuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
  if (!Array.isArray(b.parents) || b.parents.length !== 2) throw new Error("Select two saved versions.");
  const parents = b.parents.map((p: Record<string, unknown>) => {
    if (!p || !uuid(p.version_id) || typeof p.content_hash !== "string" || !/^[0-9a-f]{64}$/.test(p.content_hash)
      || !Number.isSafeInteger(p.evidence_revision) || Number(p.evidence_revision) < 1
      || !Number.isSafeInteger(p.visibility_epoch) || Number(p.visibility_epoch) < 1) throw new Error("Supply captured parent tokens.");
    return { version_id:p.version_id.toLowerCase(),content_hash:p.content_hash,evidence_revision:Number(p.evidence_revision),visibility_epoch:Number(p.visibility_epoch) };
  });
  const versions = new Set(parents.map(p => p.version_id));
  if (versions.size !== 2 || !uuid(b.metadata_version) || !versions.has(b.metadata_version.toLowerCase())
    || (b.seed_mode !== "uniform-seeds-v1" && b.seed_mode !== "ordered-seeds-v1")
    || typeof b.title !== "string" || !b.title.trim() || b.title.trim().length > 120
    || typeof b.copy_evidence !== "boolean" || !uuid(b.request_key)) throw new Error("Choose the merged title, category parent, seed policy and evidence option.");
  if (!Array.isArray(b.entries) || !b.entries.length || b.entries.length > 50) throw new Error("Choose 1–50 members.");
  const ids = new Set<string>();
  const entries = b.entries.map((e: Record<string, unknown>) => {
    if (!e || !uuid(e.source_id) || !uuid(e.metadata_version) || !versions.has(e.metadata_version.toLowerCase())
      || typeof e.is_seed !== "boolean" || typeof e.rationale !== "string" || e.rationale.length > 1000
      || (e.is_seed ? !e.rationale.trim() : e.rationale !== "") || ids.has(e.source_id.toLowerCase())) throw new Error("Reconcile unique members, captured metadata and seed rationale.");
    ids.add(e.source_id.toLowerCase());
    return { source_id:e.source_id.toLowerCase(),metadata_version:e.metadata_version.toLowerCase(),is_seed:e.is_seed,rationale:e.rationale.trim() };
  });
  if (!entries.some(e => e.is_seed)) throw new Error("Choose at least one seed explicitly.");
  return { parents,metadata_version:b.metadata_version.toLowerCase(),seed_mode:b.seed_mode,title:b.title.trim(),copy_evidence:b.copy_evidence,entries,request_key:b.request_key.toLowerCase() };
}
