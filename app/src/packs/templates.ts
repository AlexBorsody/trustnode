import { parseRevision, UUID } from "./model";

export type SeedMode = "uniform-seeds-v1" | "ordered-seeds-v1";
export interface TemplateEntry {
  source_id: string; title: string; url: string | null; normalized_url: string | null;
  site_id: string | null; site_host: string | null; status: string;
  rank: number; note: string; is_seed: boolean; rationale: string;
}
export interface TemplateVersion {
  id: string; pack_id: string; pack_revision: number; content_hash: string; created_at: string;
  snapshot: {
    schema_version: "seed-template-v1"; policy_version: "accepted-edges-v1";
    title: string; description: string; category: string; category_id: string;
    category_key: string; owner_id: string; tags: string[]; pack_revision: number;
    seed_mode: SeedMode; entries: TemplateEntry[];
  };
}
export interface SeedChoice { source_id: string; rationale: string }
export function parseTemplateCapture(input: unknown) {
  const revision = parseRevision(input);
  const body = input as Record<string, unknown>;
  if (body.seed_mode !== "uniform-seeds-v1" && body.seed_mode !== "ordered-seeds-v1") throw new Error("Choose equal or ordered seed weighting.");
  if (!Array.isArray(body.seeds) || body.seeds.length < 1 || body.seeds.length > 50) throw new Error("Choose 1–50 seed sources.");
  const ids = new Set<string>();
  const seeds: SeedChoice[] = body.seeds.map(value => {
    if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.source_id !== "string" || !UUID.test(value.source_id)) throw new Error("Each seed needs a source ID.");
    const source_id = value.source_id.toLowerCase();
    if (ids.has(source_id)) throw new Error("Choose each seed once.");
    ids.add(source_id);
    if (typeof value.rationale !== "string" || !value.rationale.trim() || value.rationale.trim().length > 1000) throw new Error("Explain each seed choice in 1–1,000 characters.");
    return { source_id, rationale: value.rationale.trim() };
  });
  return { revision, seed_mode: body.seed_mode as SeedMode, seeds };
}

/** Seed mass is an explicit input to future graph computation, not a trust score. */
export function seedDistribution(entries: TemplateEntry[], mode: SeedMode) {
  const seeds = entries.filter(e => e.is_seed).sort((a, b) => a.rank - b.rank || (a.source_id < b.source_id ? -1 : a.source_id > b.source_id ? 1 : 0));
  const weighted = seeds.map((entry, index) => ({ entry, raw: mode === "ordered-seeds-v1" ? 1 / (index + 1) : 1 }));
  const resourceTotal = weighted.reduce((sum, e) => sum + e.raw, 0);
  const sites = new Map<string, { id: string; host: string; raw: number }>();
  for (const { entry, raw } of weighted) if (entry.site_id && entry.site_host) {
    const current = sites.get(entry.site_id);
    if (!current || current.raw < raw) sites.set(entry.site_id, { id: entry.site_id, host: entry.site_host, raw });
  }
  const siteRows = [...sites.values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const siteTotal = siteRows.reduce((sum, s) => sum + s.raw, 0);
  return {
    resources: weighted.map(({ entry, raw }) => ({ id: entry.source_id, raw_weight: raw, mass: raw / resourceTotal })),
    sites: siteRows.map(s => ({ id: s.id, host: s.host, raw_weight: s.raw, mass: s.raw / siteTotal })),
  };
}
