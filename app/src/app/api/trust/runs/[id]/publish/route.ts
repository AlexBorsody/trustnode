import { boundedJson } from "@/lib/request-body";
import { trustClient, trustFailure, trustId, trustJson, trustRevision } from "@/lib/trust-api";
export const dynamic = "force-dynamic";
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  let input;
  try { const body = await boundedJson(req, 4096) as Record<string, unknown>;
    input = { p_run: trustId((await context.params).id), p_pack_revision: trustRevision(body.pack_revision), p_evidence_revision: trustRevision(body.evidence_revision) };
  } catch { return trustJson({ error: "Supply the run and captured revisions." }, 400); }
  const client = await trustClient(req, true); if (client.error) return client.error;
  const { data, error } = await client.sb.rpc("tn_publish_trust_run", input);
  return error ? trustFailure(error) : trustJson({ publication_id: data }, 201);
}
