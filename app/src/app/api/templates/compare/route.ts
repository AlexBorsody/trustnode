import { readReferenceComparison } from "@/lib/template-reference-api";
import { trustJson } from "@/lib/trust-api";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const result = await readReferenceComparison(req);
  return result.error ?? trustJson(result.data);
}
