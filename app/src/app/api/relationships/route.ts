import { boundedJson } from "@/lib/request-body";
import { evidenceClient, evidenceFailure, evidenceJson as json } from "@/lib/evidence-api";
import { evidenceId, parseRelationship } from "@/sources/relationships";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const search = new URL(req.url).searchParams;
  let version: string;
  try { version = evidenceId(search.get("template_version")); } catch { return json({ error: "Template not found." }, 404); }
  const offset = Number(search.get("offset") ?? 0);
  if (!Number.isInteger(offset) || offset < 0 || offset > 10000) return json({ error: "Invalid page offset." }, 400);
  const client = await evidenceClient(req); if (client.error) return client.error;
  const { data: template, error: templateError } = await client.sb.from("tn_pack_versions").select("id").eq("id", version).maybeSingle();
  if (templateError) return json({ error: "Evidence storage is unavailable." }, 503);
  if (!template) return json({ error: "Template not found or private." }, 404);
  const { data, error } = await client.sb.rpc("tn_list_relationships", { p_version: version, p_offset: offset });
  if (error) return json({ error: "Could not load evidence. Check database setup." }, 503);
  return json({ relationships: data, offset, limit: 20 });
}
export async function POST(req: Request) {
  let input;
  try { input = parseRelationship(await boundedJson(req)); }
  catch (error) { return json({ error: error instanceof Error ? error.message : "Invalid evidence." }, 400); }
  const client = await evidenceClient(req, true); if (client.error) return client.error;
  const { data, error } = await client.sb.rpc("tn_save_relationship", { p_version: input.template_version_id,
    p_edge: input.edge_id, p_previous: input.previous_revision_id, p_body: input.evidence });
  return error ? evidenceFailure(error) : json(data, 201);
}
