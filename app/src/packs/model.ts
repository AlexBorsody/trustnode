export interface PackEntry { source_id: string; note: string }
export interface PackInput {
  title: string; description: string; category: string; tags: string[];
  is_public: boolean; entries: PackEntry[];
}
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseRevision(input: unknown): number {
  const revision = input && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>).revision : undefined;
  if (typeof revision !== "number" || !Number.isInteger(revision) || revision < 1 || revision > 2147483647) {
    throw new Error("Reload this pack before saving or deleting it.");
  }
  return revision;
}
export function parsePack(input: unknown): PackInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Expected a source pack object.");
  const body = input as Record<string, unknown>;
  function text(key: string, max: number, required = false) {
    const value = body[key] ?? "";
    if (typeof value !== "string" || value.trim().length > max || (required && !value.trim())) {
      throw new Error(`${key} must be ${required ? "nonempty " : ""}text, at most ${max} characters.`);
    }
    return value.trim();
  }
  const title = text("title", 120, true);
  const description = text("description", 2000);
  const category = text("category", 80, true);
  if (typeof body.is_public !== "boolean") throw new Error("Choose public or private visibility.");
  if (!Array.isArray(body.tags) || body.tags.length > 10 || body.tags.some(t => typeof t !== "string" || !t.trim() || t.trim().length > 40)) {
    throw new Error("Use up to 10 text tags, each 1–40 characters.");
  }
  if (!Array.isArray(body.entries) || body.entries.length < 1 || body.entries.length > 50) throw new Error("Choose between 1 and 50 sources.");
  const ids = new Set<string>();
  const entries = body.entries.map(entry => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry) || typeof entry.source_id !== "string" || !UUID.test(entry.source_id)) throw new Error("Each source needs a valid ID.");
    const id = entry.source_id.toLowerCase();
    if (ids.has(id)) throw new Error("A source can appear only once in a pack.");
    ids.add(id);
    if (typeof entry.note !== "string" || entry.note.trim().length > 1000) throw new Error("Source notes must be text, at most 1000 characters.");
    return { source_id: id, note: entry.note.trim() };
  });
  return { title, description, category, tags: [...new Set((body.tags as string[]).map(t => t.trim()))], is_public: body.is_public, entries };
}

export interface ForkOrigin { id: string; revision: number }
export function parseForkOrigin(input: unknown): ForkOrigin | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = (input as Record<string, unknown>).fork_of;
  if (value === undefined) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Choose an accessible parent pack.");
  const parent = value as Record<string, unknown>;
  if (typeof parent.id !== "string" || !UUID.test(parent.id)) throw new Error("Choose an accessible parent pack.");
  return { id: parent.id.toLowerCase(), revision: parseRevision(parent) };
}

export function parseMergeOrigins(input: unknown): ForkOrigin[] | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const body = input as Record<string, unknown>;
  if (body.merge_of === undefined) return null;
  if (body.fork_of !== undefined) throw new Error("Choose either a copy or a merge.");
  if (!Array.isArray(body.merge_of) || body.merge_of.length !== 2) throw new Error("Choose two packs to merge.");
  const parents = body.merge_of.map(parent => parseForkOrigin({ fork_of: parent })!);
  if (parents[0].id === parents[1].id) throw new Error("Choose two different packs to merge.");
  return parents;
}

export type PackSource = { id: string; title: string; url: string | null; kind: string; status: string };
