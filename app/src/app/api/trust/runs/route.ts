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
