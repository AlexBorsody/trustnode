import { readTrust, trustJson } from "@/lib/trust-api";
export const dynamic = "force-dynamic";
export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const result = await readTrust(req, (await context.params).id);
  return result.error ?? trustJson(result.data);
}
