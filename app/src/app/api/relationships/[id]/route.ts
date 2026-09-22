import { evidenceClient, evidenceJson as json } from "@/lib/evidence-api";
import { UUID } from "@/packs/model";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

/** Independently paginated immutable revisions and review events for one edge. */
export async function GET(req: Request, { params }: Context) {
  const { id } = await params;
  if (!UUID.test(id)) return json({ error: "Relationship not found." }, 404);
  const search = new URL(req.url).searchParams;
  const before = Number(search.get("before_revision") ?? 2147483647);
  const reviewBefore = Number(search.get("before_review") ?? Number.MAX_SAFE_INTEGER);
  if (before > 2147483647 || ![before, reviewBefore].every(x => Number.isSafeInteger(x) && x > 0)) return json({ error: "Invalid history cursor." }, 400);
  const client = await evidenceClient(req); if (client.error) return client.error;
  const { data: edge, error } = await client.sb.from("tn_source_edges").select("*").eq("id", id).maybeSingle();
  if (error) return json({ error: "Evidence storage is unavailable." }, 503);
  if (!edge) return json({ error: "Relationship not found or private." }, 404);
  const [revisions, reviews] = await Promise.all([
    client.sb.from("tn_edge_revisions").select("*").eq("edge_id", id).lt("revision", before).order("revision", { ascending: false }).limit(20),
    client.sb.from("tn_edge_reviews").select("*,tn_edge_revisions!inner(edge_id)").eq("tn_edge_revisions.edge_id", id).lt("id", reviewBefore).order("id", { ascending: false }).limit(20),
  ]);
  if (revisions.error || reviews.error) return json({ error: "Could not load evidence history." }, 503);
  return json({ edge, revisions: revisions.data, reviews: reviews.data, limit: 20,
    next_revision: revisions.data.length === 20 ? revisions.data.at(-1)?.revision : null,
    next_review: reviews.data.length === 20 ? reviews.data.at(-1)?.id : null });
}
