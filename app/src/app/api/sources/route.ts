import { NextResponse } from "next/server";
import {
  bearerToken,
  publicFileUrl,
  slugify,
  supabaseConfigured,
  supabaseFor,
} from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: CORS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

// ---------------------------------------------------------------------------
// shape
// ---------------------------------------------------------------------------

interface SourceRow {
  id: string;
  kind: "file" | "link";
  title: string;
  url: string | null;
  file_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  status: string;
  excerpt: string | null;
  created_at: string;
  tn_categories: { slug: string; name: string } | null;
  tn_source_tags: { tn_tags: { slug: string; label: string } | null }[];
}

function mapRow(r: SourceRow) {
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    url: r.kind === "link" ? r.url : r.url,
    file_url: r.kind === "file" && r.file_path ? publicFileUrl(r.file_path) : null,
    file_name: r.file_name,
    mime_type: r.mime_type,
    status: r.status,
    excerpt: r.excerpt,
    created_at: r.created_at,
    category: r.tn_categories
      ? { slug: r.tn_categories.slug, name: r.tn_categories.name }
      : null,
    tags: r.tn_source_tags
      .map((j) => j.tn_tags)
      .filter((t): t is { slug: string; label: string } => !!t),
  };
}

const BASE_SELECT = `
  id, kind, title, url, file_path, file_name, mime_type, status, excerpt, created_at,
`;

// ---------------------------------------------------------------------------
// GET /api/sources — the public commons shelf
//
// DESIGN §§8, 19: category/tag/q filter inside PostgREST (never in memory
// after limit), pg_trgm-backed q on title/excerpt, limit/offset pagination.
// ---------------------------------------------------------------------------

export async function GET(req: Request) {
  if (!supabaseConfigured()) {
    return json({ error: "source commons not configured yet" }, 503);
  }
  const sp = new URL(req.url).searchParams;
  const limit = Math.min(100, Math.max(1, parseInt(sp.get("limit") ?? "50", 10) || 50));
  const offset = Math.max(0, parseInt(sp.get("offset") ?? "0", 10) || 0);
  const category = sp.get("category");
  const tag = sp.get("tag");
  const q = (sp.get("q") ?? "").trim();

  // Inner-join hints only when the corresponding filter is active, so
  // unfiltered reads keep the cheap outer-join shape.
  const select =
    BASE_SELECT +
    (category ? "tn_categories!inner ( slug, name )," : "tn_categories ( slug, name ),") +
    (tag
      ? "tn_source_tags!inner ( tn_tags!inner ( slug, label ) )"
      : "tn_source_tags ( tn_tags ( slug, label ) )");

  const sb = supabaseFor();
  let query = sb.from("tn_sources").select(select, { count: "exact" });
  if (category) query = query.eq("tn_categories.slug", category);
  if (tag) query = query.eq("tn_source_tags.tn_tags.slug", tag);
  if (q) {
    // Substring search on title + excerpt, served by the pg_trgm GIN indexes
    // (db/migration-001c-sources-trgm.sql). Escape LIKE wildcards; commas
    // would break the .or() list syntax.
    const esc = q
      .replace(/,/g, " ")
      .replace(/\\/g, "\\\\")
      .replace(/%/g, "\\%")
      .replace(/_/g, "\\_");
    query = query.or(`title.ilike.%${esc}%,excerpt.ilike.%${esc}%`);
  }
  query = query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) return json({ error: error.message }, 500);

  const rows = ((data ?? []) as unknown as SourceRow[]).map(mapRow);
  return json({ sources: rows, limit, offset, total: count ?? rows.length });
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

async function attachTags(sb: SupabaseClient, sourceId: string, tags: unknown) {
  const list = Array.isArray(tags) ? tags : String(tags ?? "").split(",");
  const slugs = [...new Set(list.map((t) => slugify(String(t))).filter(Boolean))].slice(0, 10);
  for (const slug of slugs) {
    const label =
      list.map((t) => String(t).trim()).find((t) => slugify(t) === slug) ?? slug;
    const { data: tag } = await sb
      .from("tn_tags")
      .upsert({ slug, label }, { onConflict: "slug" })
      .select("id")
      .single();
    if (tag) {
      await sb
        .from("tn_source_tags")
        .upsert(
          { source_id: sourceId, tag_id: (tag as { id: string }).id },
          { onConflict: "source_id,tag_id" },
        );
    }
  }
}

async function resolveCategoryId(
  sb: SupabaseClient,
  slug: unknown,
): Promise<string | null> {
  const s = slugify(String(slug ?? "general")) || "general";
  const { data } = await sb.from("tn_categories").select("id").eq("slug", s).single();
  return (data as { id: string } | null)?.id ?? null;
}

async function requireUser(sb: SupabaseClient) {
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

/** Fetch a page server-side and pull a title + plain-text excerpt. */
async function fetchLinkMeta(url: string): Promise<{ title: string; text: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "user-agent": "TrustNodeBot/0.2 (+https://trustnode-lemon.vercel.app)" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    if (buf.byteLength > 600_000) throw new Error("page too large");
    const html = new TextDecoder().decode(buf);
    const title =
      html.match(/<title[^>]*>([^<]{1,200})<\/title>/i)?.[1]?.trim() ?? "";
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 4000);
    return { title, text };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// POST /api/sources — contribute a link (signed in)
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  if (!supabaseConfigured()) {
    return json({ error: "source commons not configured yet" }, 503);
  }
  const token = bearerToken(req);
  if (!token) return json({ error: "sign in to contribute" }, 401);

  let body: {
    url?: string;
    title?: string;
    category?: string;
    tags?: unknown;
    description?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "expected JSON body" }, 400);
  }

  const rawUrl = (body.url ?? "").trim();
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return json({ error: "invalid URL" }, 400);
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return json({ error: "only http(s) URLs" }, 400);
  }

  const sb = supabaseFor(token);
  const user = await requireUser(sb);
  if (!user) return json({ error: "sign in to contribute" }, 401);

  // already shelved?
  const { data: existing } = await sb
    .from("tn_sources")
    .select("id")
    .eq("kind", "link")
    .eq("url", parsed.toString())
    .limit(1);
  if (existing && existing.length) {
    return json({ error: "that link is already in the commons", id: existing[0].id }, 409);
  }

  let meta = { title: "", text: "" };
  try {
    meta = await fetchLinkMeta(parsed.toString());
  } catch {
    // keep going: the contributor's title/description can carry it
  }

  const title = (body.title ?? "").trim() || meta.title || parsed.hostname;
  const excerpt = (body.description ?? "").trim() || meta.text || null;
  const categoryId = await resolveCategoryId(sb, body.category);

  const { data: inserted, error } = await sb
    .from("tn_sources")
    .insert({
      owner_id: user.id,
      kind: "link",
      title: title.slice(0, 300),
      url: parsed.toString(),
      category_id: categoryId,
      status: excerpt ? "ready" : "pending",
      excerpt,
    })
    .select("id")
    .single();

  if (error || !inserted) return json({ error: error?.message ?? "insert failed" }, 500);

  const sourceId = (inserted as { id: string }).id;
  await attachTags(sb, sourceId, body.tags);

  return json({ id: sourceId, status: excerpt ? "ready" : "pending" }, 201);
}
