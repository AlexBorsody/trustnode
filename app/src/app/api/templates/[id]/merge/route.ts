import { trustClient, trustJson as json } from "@/lib/trust-api";
import { UUID } from "@/packs/model";
export const dynamic = "force-dynamic";
export async function GET(req: Request,{params}:{params:Promise<{id:string}>}) {
  const {id} = await params; if (!UUID.test(id)) return json({error:"Template not found."},404);
  const client = await trustClient(req); if(client.error) return client.error;
  const {data,error} = await client.sb.rpc("tn_template_merge_info",{p_version:id});
  if(error) return json({error:"Template merging is unavailable right now."},503);
  return data ? json(data) : json({error:"Template not found or private."},404);
}
