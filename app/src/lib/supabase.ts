/**
 * Supabase clients for the TrustNode source commons.
 *
 * Reads are public (Charter Art. II). Writes ride on the caller's JWT so
 * Postgres row-level security enforces ownership — the server never
 * bypasses RLS, and no service-role key is needed.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function supabaseConfigured(): boolean {
  return URL.startsWith("http") && ANON.length > 20;
}

/**
 * Anon client. Pass the user's access token (from `Authorization: Bearer …`)
 * and every query runs as that user under RLS.
 */
export function supabaseFor(token?: string): SupabaseClient {
  return createClient(
    URL,
    ANON,
    token
      ? { global: { headers: { Authorization: `Bearer ${token}` } } }
      : undefined,
  );
}

/** Public URL for a file in the `source-files` bucket. */
export function publicFileUrl(filePath: string): string {
  return `${URL.replace(/\/$/, "")}/storage/v1/object/public/source-files/${filePath}`;
}

/** Bearer token from the request, if present. */
export function bearerToken(req: Request): string | null {
  const h = req.headers.get("authorization");
  if (h?.toLowerCase().startsWith("bearer ")) return h.slice(7).trim();
  return null;
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
