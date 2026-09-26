import { UUID } from "./model";
import type { SeedMode } from "./templates";
export interface DiscoveryCursor { created_at: string; id: string }
export interface DiscoveryTemplate {
  id: string; pack_id: string; pack_revision: number; created_at: string; content_hash: string;
  owner_id: string | null; is_public: boolean; title: string; description: string;
  category: string; category_id: string; category_key: string; seed_mode: SeedMode;
  schema_version: string; policy_version: string;
  members: { source_id: string; title: string; url: string | null; site_id: string | null; rank: number;
    is_seed: boolean; rationale: string; adoption: { curators: number; pack_count: number; reciprocal_rank_sum: number; value: number } }[];
  origins: { version_id: string; pack_id: string; title: string; owner_id: string | null; pack_revision: number }[];
  run: { id: string; completed_at: string; methodology: string; public_readable: boolean; stale: boolean;
    site_evidence_state: string; resource_evidence_state: string } | null;
}
export interface DiscoveryPage {
  templates: DiscoveryTemplate[]; next_cursor: string | null;
  adoption_scope: { method: string; public_pack_limit: number; public_packs_considered: number };
}
export function parseDiscoveryQuery(params: URLSearchParams) {
  for (const key of params.keys()) if (!["category", "cursor", "limit"].includes(key) || params.getAll(key).length !== 1) throw new Error("Invalid discovery filter.");
  const raw = params.get("category")?.trim() ?? "";
  const parts = raw.split(">").map(p => p.trim().replace(/\s+/g, " "));
  if (raw.length > 80 || /[\u0000-\u001f]/.test(raw) || (raw && parts.some(p => !p))) throw new Error("Choose a category path of up to 80 characters.");
  const category = raw ? parts.join(" > ").toLowerCase() : null;
  if (category && category.length > 80) throw new Error("Choose a category path of up to 80 characters.");
  const limitText = params.get("limit") ?? "12", limit = Number(limitText);
  if (!/^\d+$/.test(limitText) || !Number.isInteger(limit) || limit < 1 || limit > 25) throw new Error("Page size must be 1–25.");
  let before: DiscoveryCursor | null = null;
  const cursor = params.get("cursor");
  if (cursor !== null) {
    try {
      if (!/^[A-Za-z0-9_-]{1,1024}$/.test(cursor)) throw new Error();
      const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
      if (value.v !== 1 || value.category !== category || !UUID.test(value.id)
        || typeof value.created_at !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(value.created_at)
        || !Number.isFinite(Date.parse(value.created_at))) throw new Error();
      // Preserve microseconds from PostgreSQL; JS Date would lose the tie boundary.
      before = { created_at: value.created_at, id: value.id.toLowerCase() };
    } catch { throw new Error("Invalid cursor. Restart discovery for this category."); }
  }
  return { category, limit, before };
}
export function discoveryCursor(next: DiscoveryCursor | null, category: string | null) {
  return next ? Buffer.from(JSON.stringify({ v: 1, category, ...next })).toString("base64url") : null;
}
