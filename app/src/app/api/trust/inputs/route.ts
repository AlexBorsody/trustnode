import { trustClient, trustId, trustJson } from "@/lib/trust-api";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  let version;
  try { version = trustId(new URL(req.url).searchParams.get("template_version")); } catch { return trustJson({ error: "Template not found." }, 404); }
  const client = await trustClient(req); if (client.error) return client.error;
  const { data, error } = await client.sb.from("tn_pack_versions").select("id,content_hash,evidence_revision,tn_packs!inner(id,revision)").eq("id", version).maybeSingle();
  if (error) return trustJson({ error: "Trust storage is unavailable." }, 503);
  return data ? trustJson(data) : trustJson({ error: "Template not found or private." }, 404);
}
