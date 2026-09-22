import { boundedJson } from "@/lib/request-body";
import { trustClient, trustFailure, trustId, trustJson, trustRevision } from "@/lib/trust-api";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  let input;
  try {
    const body = await boundedJson(req, 4096) as Record<string, unknown>;
    input = { p_version: trustId(body.template_version_id), p_pack_revision: trustRevision(body.pack_revision),
      p_evidence_revision: trustRevision(body.evidence_revision), p_request_key: trustId(body.request_key) };
  } catch { return trustJson({ error: "Supply the template, captured revisions and an idempotency request key." }, 400); }
  const client = await trustClient(req, true); if (client.error) return client.error;
  const { data, error } = await client.sb.rpc("tn_enqueue_trust_run", input);
  return error ? trustFailure(error) : trustJson(data, data.state === "completed" ? 200 : 202);
}

export async function GET(req: Request) {
  const search = new URL(req.url).searchParams;
  let version: string;
  try { version = trustId(search.get("template_version")); } catch { return trustJson({ error: "Template not found." }, 404); }
  const offset = Number(search.get("offset") ?? 0);
  if (!Number.isInteger(offset) || offset < 0 || offset > 10000) return trustJson({ error: "Invalid run page." }, 400);
  const client = await trustClient(req); if (client.error) return client.error;
  const { data: template, error: templateError } = await client.sb.from("tn_pack_versions").select("id").eq("id", version).maybeSingle();
  if (templateError) return trustJson({ error: "Trust storage is unavailable." }, 503);
  if (!template) return trustJson({ error: "Template not found or private." }, 404);
  const { data, error } = await client.sb.from("tn_trust_runs")
    .select("id,state,created_at,completed_at,tn_graph_snapshots!inner(template_version_id)")
    .eq("tn_graph_snapshots.template_version_id", version).order("created_at", { ascending: false }).order("id").range(offset, offset + 19);
  return error ? trustFailure(error) : trustJson({ runs: data, offset, limit: 20 });
}
