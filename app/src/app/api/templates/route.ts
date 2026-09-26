import { trustClient, trustJson as json } from "@/lib/trust-api";
import { discoveryCursor, parseDiscoveryQuery, type DiscoveryCursor } from "@/packs/template-discovery";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  let query;
  try { query = parseDiscoveryQuery(new URL(req.url).searchParams); }
  catch (e) { return json({ error: e instanceof Error ? e.message : "Invalid discovery page." }, 400); }
  const client = await trustClient(req); if (client.error) return client.error;
  const { data, error } = await client.sb.rpc("tn_discover_templates", {
    p_category: query.category, p_before_time: query.before?.created_at ?? null,
    p_before_id: query.before?.id ?? null, p_limit: query.limit,
  });
  if (error || !data) return json({ error: "Saved-template discovery is unavailable. Try again when storage is ready." }, 503);
  return json({ templates: data.templates, next_cursor: discoveryCursor(data.next as DiscoveryCursor | null, query.category), adoption_scope: data.adoption_scope });
}
