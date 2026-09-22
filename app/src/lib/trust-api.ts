import { NextResponse } from "next/server";
import { bearerToken, supabaseConfigured, supabaseFor } from "./supabase";
import { UUID } from "../packs/model";
export const trustHeaders = { "Cache-Control": "private, no-store", Vary: "Authorization" };
export const trustJson = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: trustHeaders });
export async function trustClient(req: Request, write = false) {
  if (!supabaseConfigured()) return { error: trustJson({ error: "Trust storage is unavailable." }, 503) };
  const token = bearerToken(req), sb = supabaseFor(token ?? undefined);
  if (write && !token) return { error: trustJson({ error: "Sign in to compute or publish a trust run." }, 401) };
  if (token) { const { data, error } = await sb.auth.getUser(); if (error || !data.user) return { error: trustJson({ error: "Sign in again." }, 401) }; }
  return { sb };
}
export function trustFailure(error: { code?: string }) {
  const code = error.code;
  const status = code === "PT404" ? 404 : code === "PT409" ? 409 : code === "PT422" ? 422 : code === "PT429" ? 429 : code === "22023" || code === "22P02" ? 400 : 503;
  const messages: Record<number, string> = { 404: "Trust run or template not found or private.", 409: "Inputs, visibility or run state changed. Reload before continuing.",
    422: "This graph or result exceeds the supported computation limits.", 429: "Compute limit reached or this input is already queued. Try later.",
    400: "Check the template, revisions and request key.", 503: "Trust storage or its worker is unavailable." };
  return trustJson({ error: messages[status] }, status);
}
export function trustId(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) throw new Error("Invalid record ID."); return value.toLowerCase();
}
export function trustRevision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new Error("Expected revisions are required."); return value as number;
}
export async function readTrust(req: Request, runId: string, part = "status", nodeId: string | null = null) {
  let id: string;
  try { id = trustId(runId); if (nodeId) trustId(nodeId); } catch { return { error: trustJson({ error: "Trust record not found." }, 404) }; }
  const query = new URL(req.url).searchParams, projection = query.get("projection") ?? "site", offset = Number(query.get("offset") ?? 0);
  if (!["resource", "site"].includes(projection) || !Number.isInteger(offset) || offset < 0 || offset > 1000) return { error: trustJson({ error: "Invalid score page." }, 400) };
  const client = await trustClient(req); if (client.error) return { error: client.error };
  const { data, error } = await client.sb.rpc("tn_read_trust_run", { p_run: id, p_part: part, p_projection: projection, p_offset: offset, p_node: nodeId });
  return error ? { error: trustFailure(error) } : { data };
}
