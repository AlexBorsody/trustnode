import { boundedJson } from "@/lib/request-body";
import { bearerToken } from "@/lib/supabase";
import { trustClient, trustJson as json } from "@/lib/trust-api";
import { parseTemplateMerge } from "@/packs/template-merge";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  if (!bearerToken(req)) return json({ error:"Sign in to merge saved templates." },401);
  let input;
  try { input = parseTemplateMerge(await boundedJson(req, 100_000)); }
  catch(e) { return json({ error:e instanceof Error ? e.message : "Invalid merge." },400); }
  const client = await trustClient(req); if (client.error) return client.error;
  const { data,error } = await client.sb.rpc("tn_merge_templates",{p_input:input});
  if (error) {
    if (error.code === "PT404") return json({error:"A selected template is unavailable or private."},404);
    if (error.code === "PT409") return json({error:"Merge inputs or visibility changed. Reload both parents before starting a new request."},409);
    if (error.code === "PT422") return json({error:"Combined evidence exceeds copy limits. Merge seeds without evidence instead."},422);
    if (["22023","22P02","22003","23514","23503"].includes(error.code)) return json({error:"Check the selected parents, members and seed reconciliation."},400);
    return json({error:"Template merging is unavailable. Your request is retained for retry."},503);
  }
  return json(data,data.reused ? 200 : 201);
}
