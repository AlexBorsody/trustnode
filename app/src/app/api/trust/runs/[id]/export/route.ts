import { readTrust, trustHeaders, trustJson } from "@/lib/trust-api";
export const dynamic = "force-dynamic";
export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const part = new URL(req.url).searchParams.get("part") ?? "manifest";
  if (!["manifest", "input", "canonical", "raw"].includes(part)) return trustJson({ error: "Choose manifest, input, canonical or raw export." }, 400);
  const { id } = await context.params, result = await readTrust(req, id, part);
  if (result.error) return result.error;
  return new Response(part === "input" || part === "canonical" ? result.data.text : JSON.stringify(result.data), {
    headers: { ...trustHeaders, "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="trust-${id}-${part}.json"` },
  });
}
