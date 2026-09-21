"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const authConfigured = url.startsWith("http") && key.length > 20;
let client: SupabaseClient | null = null;
export function authClient(): SupabaseClient {
  if (!authConfigured) throw new Error("Account access is not configured yet.");
  return client ??= createClient(url, key, { auth: { flowType: "pkce", detectSessionInUrl: true } });
}
