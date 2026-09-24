import { boundedJson } from "@/lib/request-body";
import { bearerToken } from "@/lib/supabase";
import { trustClient, trustJson as json } from "@/lib/trust-api";
import { UUID } from "@/packs/model";
import { parseTemplateFork } from "@/packs/template-fork";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
function failure(error: { code?: string }) {
  if (error.code === "PT404") return json({ error: "Template not found or private." }, 404);
  if (error.code === "PT409") return json({ error: "Fork inputs or visibility changed. Reload the fork summary before starting a new request." }, 409);
  if (error.code === "PT422") return json({ error: "This evidence copy exceeds the supported limits. You can fork seeds without evidence." }, 422);
  if (["22023", "22P02", "23514", "23503"].includes(error.code ?? "")) return json({ error: "Check the selected template, title and evidence choice." }, 400);
  return json({ error: "Template forking is unavailable. Your request is retained for retry." }, 503);
}
export async function GET(req: Request, { params }: Context) {
  const { id } = await params; if (!UUID.test(id)) return json({ error: "Template not found." }, 404);
  const client = await trustClient(req); if (client.error) return client.error;
  const { data, error } = await client.sb.rpc("tn_template_fork_info", { p_version: id });
  return error ? failure(error) : data ? json(data) : json({ error: "Template not found or private." }, 404);
}
export async function POST(req: Request, { params }: Context) {
  const { id } = await params; if (!UUID.test(id)) return json({ error: "Template not found." }, 404);
  if (!bearerToken(req)) return json({ error: "Sign in to fork a saved template." }, 401);
  let input;
  try { input = parseTemplateFork(await boundedJson(req, 4096)); }
  catch (e) { return json({ error: e instanceof Error ? e.message : "Invalid fork request." }, 400); }
  const client = await trustClient(req); if (client.error) return client.error;
  const { data, error } = await client.sb.rpc("tn_fork_template", { p_version: id, p_hash: input.content_hash,
    p_evidence_revision: input.evidence_revision, p_visibility_epoch: input.visibility_epoch,
    p_copy_evidence: input.copy_evidence, p_title: input.title, p_request_key: input.request_key });
  return error ? failure(error) : json(data, data.reused ? 200 : 201);
}
