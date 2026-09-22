import assert from "node:assert/strict";
import { test } from "node:test";
process.env.SUPABASE_URL = "https://trust-fixture.invalid";
process.env.SUPABASE_ANON_KEY = "fixture-public-key-not-a-real-secret";
const run = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", version = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
test("trust APIs preserve capture tokens, scope, private responses and exact export bytes", async () => {
  const previousFetch = globalThis.fetch;
  let dbCode: string | null = null, expired = false, calls = 0, parameters: Record<string, unknown> = {};
  const inputText = '{"captured": 1, "hash": "exact whitespace"}';
  try {
    globalThis.fetch = async (url, init) => {
      const req = new Request(url, init), path = new URL(req.url).pathname;
      if (path.endsWith("/user")) return new Response(JSON.stringify(expired ? { message: "expired" } : { id: run }), { status: expired ? 401 : 200 });
      calls++;
      if (path.includes("/rpc/")) {
        parameters = await req.json();
        return new Response(JSON.stringify(dbCode ? { code: dbCode, message: "private SQL internals" } : path.endsWith("tn_read_trust_run") ? { text: inputText } : { run_id: run, state: "queued" }), { status: dbCode ? 400 : 200 });
      }
      return new Response("null");
    };
    const enqueue = await import("../src/app/api/trust/runs/route");
    const status = await import("../src/app/api/trust/runs/[id]/route");
    const publish = await import("../src/app/api/trust/runs/[id]/publish/route");
    const exporter = await import("../src/app/api/trust/runs/[id]/export/route");
    const node = await import("../src/app/api/trust/[node_id]/route");
    const ctx = { params: Promise.resolve({ id: run }) };
    const body = { template_version_id: version, pack_revision: 3, evidence_revision: 9, request_key: run };
    const post = (payload = body, token = "fixture") => new Request("https://example.org/api/trust/runs", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(payload) });
    assert.equal((await enqueue.POST(post(body, ""))).status, 401); assert.equal(calls, 0);
    assert.equal((await enqueue.POST(post({ ...body, evidence_revision: 0 }))).status, 400); assert.equal(calls, 0);
    const accepted = await enqueue.POST(post()); assert.equal(accepted.status, 202);
    assert.deepEqual({ ...parameters }, { p_version: version, p_pack_revision: 3, p_evidence_revision: 9, p_request_key: run });
    assert.equal(accepted.headers.get("Cache-Control"), "private, no-store");
    await publish.POST(post(), ctx); assert.equal(parameters.p_run, run); assert.equal(parameters.p_evidence_revision, 9);
    const exported = await exporter.GET(new Request("https://example.org/api/trust/runs/id/export?part=input"), ctx);
    assert.equal(await exported.text(), inputText); assert.equal(parameters.p_part, "input");
    assert.equal(exported.headers.get("Cache-Control"), "private, no-store");
    await node.GET(new Request(`https://example.org/api/trust/node?run_id=${run}&projection=resource`), { params: Promise.resolve({ node_id: version }) });
    assert.equal(parameters.p_node, version); assert.equal(parameters.p_projection, "resource");
    for (const [code, expected] of [["PT404", 404], ["PT409", 409], ["PT422", 422], ["PT429", 429], ["PT503", 503], ["PGRST202", 503]] as const) {
      dbCode = code; const response = await enqueue.POST(post()); assert.equal(response.status, expected); assert(!JSON.stringify(await response.json()).includes("private SQL"));
    }
    dbCode = "PT404"; assert.equal((await status.GET(new Request("https://example.org/api/trust/runs/id"), ctx)).status, 404);
    const before = calls; expired = true; assert.equal((await enqueue.POST(post())).status, 401); assert.equal(calls, before);
    assert.equal((await exporter.GET(new Request("https://example.org/export?part=secret"), ctx)).status, 400);
  } finally { globalThis.fetch = previousFetch; }
});
