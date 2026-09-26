import { readReferenceComparison } from "@/lib/template-reference-api";
import { trustHeaders } from "@/lib/trust-api";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const result = await readReferenceComparison(req, true); if (result.error) return result.error;
  return new Response(JSON.stringify(result.data, null, 2), { headers: { ...trustHeaders,
    "Content-Type": "application/json; charset=utf-8",
    "Content-Disposition": `attachment; filename="template-comparison-${result.data!.reference.run_id}.json"` } });
}
