import { boundedJson } from "@/lib/request-body";
import { evidenceClient, evidenceFailure, evidenceJson as json } from "@/lib/evidence-api";
import { parseEvidenceReview } from "@/sources/relationships";
import { UUID } from "@/packs/model";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

/** id is the immutable revision being reviewed, never an implicit latest head. */
export async function POST(req: Request, { params }: Context) {
  const { id } = await params;
  if (!UUID.test(id)) return json({ error: "Evidence revision not found." }, 404);
  let input;
  try { input = parseEvidenceReview(await boundedJson(req)); }
  catch (error) { return json({ error: error instanceof Error ? error.message : "Invalid review." }, 400); }
  const client = await evidenceClient(req, true); if (client.error) return client.error;
  const { data, error } = await client.sb.rpc("tn_review_relationship", { p_revision: id, p_action: input.action,
    p_reason: input.reason, p_expected_decision: input.expected_decision_id, p_evidence_reviewed: input.evidence_reviewed,
    p_locator: input.locator, p_excerpt: input.excerpt, p_challenge: input.challenge_id });
  return error ? evidenceFailure(error) : json(data, 201);
}
