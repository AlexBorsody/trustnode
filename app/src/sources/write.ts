import { slugify } from "@/lib/supabase";

export function sourceTags(value: unknown) {
  const list = Array.isArray(value) ? value : String(value ?? "").split(",");
  const tags = new Map<string, { slug: string; label: string }>();
  for (const item of list) {
    const label = String(item).trim().slice(0, 120), slug = slugify(label);
    if (slug && !tags.has(slug) && tags.size < 10) tags.set(slug, { slug, label });
  }
  return [...tags.values()];
}

export function sourceWriteError(error: { code?: string }) {
  if (error.code === "PT404") return { status: 404, error: "Source not found or not owned by your account." };
  if (error.code === "23505") return { status: 409, error: "That link is already in the commons." };
  if (["22023", "23514", "23502", "23503"].includes(error.code ?? "")) return { status: 400, error: "Check the source details, category and tags." };
  return { status: 503, error: "Could not save the source. Your entries are retained; try again." };
}
