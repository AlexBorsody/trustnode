import { createHash } from "node:crypto";
import { trustClient, trustJson as json } from "./trust-api";
import { UUID } from "../packs/model";
import { parseDiscoveryQuery } from "../packs/template-discovery";
import { compareReference, REFERENCE_METRIC, REFERENCE_SCOPE_LIMIT, type ReferenceInput, type ReferenceComparison } from "../packs/template-reference";
const HASH = /^[a-f0-9]{64}$/;
const PAGE = 12;
export async function readReferenceComparison(req: Request, exporting = false) {
  let run: string, category: string | null, hash: string | null, scope: string | null, offset = 0;
  try {
    const query = new URL(req.url).searchParams;
    for (const key of query.keys()) if (!["reference", "category", "cursor", "input_hash", "scope_hash"].includes(key) || query.getAll(key).length !== 1) throw new Error();
    run = query.get("reference") ?? ""; if (!UUID.test(run)) throw new Error(); run = run.toLowerCase();
    const filter = new URLSearchParams(); if (query.has("category")) filter.set("category", query.get("category")!);
    category = parseDiscoveryQuery(filter).category;
    hash = query.get("input_hash"); scope = query.get("scope_hash");
    if ((hash !== null && !HASH.test(hash)) || (scope !== null && !HASH.test(scope))) throw new Error();
    if (exporting && (!hash || !scope || query.has("cursor"))) throw new Error();
    if (query.has("cursor")) {
      const encoded = query.get("cursor")!; if (!/^[A-Za-z0-9_-]{1,1500}$/.test(encoded)) throw new Error();
      const c = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
      if (c.metric !== REFERENCE_METRIC || c.run !== run || c.category !== category || !HASH.test(c.hash) || !HASH.test(c.scope)
        || !Number.isInteger(c.offset) || c.offset < PAGE || c.offset >= REFERENCE_SCOPE_LIMIT || c.offset % PAGE
        || (hash && hash !== c.hash) || (scope && scope !== c.scope)) throw new Error();
      hash = c.hash; scope = c.scope; offset = c.offset;
    }
  } catch { return { error: json({ error: "Choose a completed reference run and restart comparison if its scope changed." }, 400) }; }
  const client = await trustClient(req); if (client.error) return { error: client.error };
  // Every page/export reauthorizes the reference and cohort together in one read snapshot.
  const { data, error } = await client.sb.rpc("tn_template_reference_scope", { p_run: run, p_category: category });
  if (error || !data) {
    const status = error?.code === "PT404" ? 404 : error?.code === "PT409" ? 409 : 503;
    return { error: json({ error: status === 404 ? "Reference run not found or no longer accessible." : status === 409 ? "Choose a completed reference run." : "Reference comparison is unavailable." }, status) };
  }
  const input = data as ReferenceInput;
  const scopeHash = createHash("sha256").update(JSON.stringify({ metric: REFERENCE_METRIC, run, hash: input.reference.input_hash, output_hash: input.reference.output_hash,
    algorithm: input.reference.algorithm, visibility_epoch: input.reference.visibility_epoch, category,
    versions: input.templates.map(t => [t.id, t.content_hash, t.is_public, t.visibility_epoch]), has_more: input.has_more })).digest("hex");
  if ((hash && hash !== input.reference.input_hash) || (scope && scope !== scopeHash)) return { error: json({ error: "Reference or visible comparison scope changed. Restart comparison before continuing." }, 409) };
  let ranked;
  try { ranked = compareReference(input); } catch { return { error: json({ error: "Reference comparison data is unavailable." }, 503) }; }
  const next = !exporting && offset + PAGE < ranked.length ? Buffer.from(JSON.stringify({ metric: REFERENCE_METRIC, run, category,
    hash: input.reference.input_hash, scope: scopeHash, offset: offset + PAGE })).toString("base64url") : null;
  const result: ReferenceComparison = { schema_version: "template-reference-comparison-v1", metric: REFERENCE_METRIC, reference: input.reference,
    scope: { category, limit: REFERENCE_SCOPE_LIMIT, count: ranked.length, has_more: input.has_more, hash: scopeHash,
      selection: "Newest accessible saved versions in captured category/descendants, excluding all versions from the reference pack.",
      ordering: "Median raw site mass descending; unknown last; version ID ascending for ties. Sorted across the entire bounded cohort.",
      graph_scope: "Candidate graphs, seeds and accepted evidence are not equated with the reference graph. This compares selected sites on the reference's frozen graph, not factual accuracy." },
    templates: exporting ? ranked : ranked.slice(offset, offset + PAGE), next_cursor: next };
  return { data: result };
}
