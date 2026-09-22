import { NextResponse } from "next/server";
import { bearerToken, supabaseConfigured, supabaseFor } from "./supabase";

export const evidenceJson = (data: unknown, status = 200) => NextResponse.json(data, { status,
  headers: { "Cache-Control": "private, no-store", Vary: "Authorization" } });
export async function evidenceClient(req: Request, write = false) {
  if (!supabaseConfigured()) return { error: evidenceJson({ error: "Evidence storage is unavailable." }, 503) };
  const token = bearerToken(req), sb = supabaseFor(token ?? undefined);
  if (write && !token) return { error: evidenceJson({ error: "Sign in to contribute evidence." }, 401) };
  if (token) {
    const { data, error } = await sb.auth.getUser();
    if (error || !data.user) return { error: evidenceJson({ error: "Sign in again to use your evidence." }, 401) };
  }
  return { sb };
}
export function evidenceFailure(error: { code?: string }) {
  if (error.code === "PT404") return evidenceJson({ error: "Evidence not found or unavailable to your account." }, 404);
  if (error.code === "PT409") return evidenceJson({ error: "Evidence or review changed. Reload before saving; your draft is retained." }, 409);
  if (["22023", "22P02", "22007", "22008", "23514", "23503"].includes(error.code ?? "")) return evidenceJson({ error: "Check the template members, evidence locators, quotations and observation date." }, 400);
  return evidenceJson({ error: "Could not save evidence. Your draft is retained; try again." }, 503);
}
