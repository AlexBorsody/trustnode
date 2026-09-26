export const REFERENCE_METRIC = "median-site-authority-v1";
export const REFERENCE_SCOPE_LIMIT = 50;
const compareId = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
export interface ReferenceRun {
  run_id: string; input_hash: string; output_hash: string; template_version_id: string; pack_id: string;
  category: string; category_id: string; policy_version: string;
  algorithm: { methodology: string; implementation: string; [key: string]: unknown };
  completed_at: string; visibility_epoch: number; site_evidence_state: string; stale: boolean; public_readable: boolean;
}
export interface ReferenceCandidate {
  id: string; pack_id: string; content_hash: string; pack_revision: number; created_at: string;
  title: string; owner_id: string | null; is_public: boolean; visibility_epoch: number; category: string; category_id: string;
  policy_version: string; seed_mode: string; site_ids: string[]; unmapped_resources: number;
}
export interface ReferenceInput {
  reference: ReferenceRun; site_scores: { id: string; mass: number }[];
  templates: ReferenceCandidate[]; has_more: boolean;
}
export interface ReferenceResult extends ReferenceCandidate {
  median_site_mass: number | null; mapped_sites: number; total_sites: number;
  sites: { id: string; mass: number | null }[]; same_category_identity: boolean;
}
export interface ReferenceComparison {
  schema_version: "template-reference-comparison-v1"; metric: typeof REFERENCE_METRIC;
  reference: ReferenceRun;
  scope: { category: string | null; limit: number; count: number; has_more: boolean; hash: string;
    selection: string; ordering: string; graph_scope: string };
  templates: ReferenceResult[]; next_cursor: string | null;
}
/** Describe a template using a separately selected frozen site vector. Never recompute graph authority. */
export function compareReference(input: ReferenceInput): ReferenceResult[] {
  const masses = new Map<string, number>();
  for (const { id, mass } of input.site_scores) {
    if (masses.has(id) || !Number.isFinite(mass) || mass < 0 || mass > 1) throw new Error("Invalid reference site masses.");
    masses.set(id, mass);
  }
  return input.templates.map(t => {
    if (t.pack_id === input.reference.pack_id || t.id === input.reference.template_version_id) throw new Error("A template cannot rank itself.");
    const sites = [...new Set(t.site_ids)].sort(compareId).map(id => ({ id, mass: masses.get(id) ?? null }));
    const values = sites.flatMap(s => s.mass === null ? [] : [s.mass]).sort((a, b) => a - b), n = values.length;
    const median = n ? n % 2 ? values[(n - 1) / 2] : (values[n / 2 - 1] + values[n / 2]) / 2 : null;
    return { ...t, site_ids: sites.map(s => s.id), sites, median_site_mass: median,
      mapped_sites: n, total_sites: sites.length, same_category_identity: t.category_id === input.reference.category_id };
  }).sort((a, b) => {
    if (a.median_site_mass === null && b.median_site_mass !== null) return 1;
    if (b.median_site_mass === null && a.median_site_mass !== null) return -1;
    return (b.median_site_mass ?? 0) - (a.median_site_mass ?? 0) || compareId(a.id, b.id);
  });
}
