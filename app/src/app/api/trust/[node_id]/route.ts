import { readTrust, trustJson } from "@/lib/trust-api";
export const dynamic = "force-dynamic";
export async function GET(req: Request, context: { params: Promise<{ node_id: string }> }) {
  const result = await readTrust(req, new URL(req.url).searchParams.get("run_id") ?? "", "score", (await context.params).node_id);
  return result.error ?? trustJson(result.data);
}
