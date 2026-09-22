import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { parseTemplateCapture, seedDistribution, type TemplateEntry } from "../src/packs/templates";

const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const input = { revision: 4, seed_mode: "ordered-seeds-v1", seeds: [{ source_id: id, rationale: "Primary evidence" }] };
test("seed choices require captured revision, explicit roles and rationale", () => {
  assert.deepEqual(parseTemplateCapture(input), input);
  for (const value of [null, { ...input, revision: 0 }, { ...input, seed_mode: "anything" },
    { ...input, seeds: [] }, { ...input, seeds: [input.seeds[0], input.seeds[0]] },
    { ...input, seeds: [{ source_id: id, rationale: " " }] }]) assert.throws(() => parseTemplateCapture(value));
});
test("ordered resource mass and deduplicated site mass are independent", () => {
  const entry = (source_id: string, site_id: string, rank: number, is_seed = true): TemplateEntry => ({
    source_id, site_id, site_host: site_id, rank, is_seed, title: source_id, url: null, normalized_url: null,
    rationale: "Reference", note: "", status: "ready",
  });
  const entries = [entry("a", "one.example", 1), entry("b", "one.example", 2), entry("c", "two.example", 3), entry("d", "ignored.example", 4, false)];
  const result = seedDistribution(entries, "ordered-seeds-v1");
  assert.deepEqual(result.sites.map(s => s.mass), [0.75, 0.25]);
  assert.equal(result.resources.length, 3);
  assert(Math.abs(result.resources.reduce((sum, r) => sum + r.mass, 0) - 1) < 1e-12);
  assert.deepEqual(seedDistribution(entries.slice().reverse(), "ordered-seeds-v1"), result);
  assert.deepEqual(seedDistribution(entries, "uniform-seeds-v1").sites.map(s => s.mass), [0.5, 0.5]);
});

process.env.SUPABASE_URL = "https://templates.invalid";
process.env.SUPABASE_ANON_KEY = "test-public-key-for-seed-templates";
const originalFetch = globalThis.fetch;
let route: typeof import("../src/app/api/packs/[id]/versions/route");
let visible = true, expired = false, rpcError: string | null = null;
let calls: { path: string; body?: unknown }[] = [];
before(async () => {
  globalThis.fetch = async (url, init) => {
    const req = new Request(url, init), path = new URL(req.url).pathname;
    calls.push({ path, body: req.method === "POST" ? await req.json() : undefined });
    const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (path.endsWith("/user")) return expired ? reply({ message: "expired" }, 401) : reply({ id, aud: "authenticated" });
    if (path.endsWith("/tn_packs")) return reply(visible ? [{ id, revision: 4, tn_pack_sources: [] }] : []);
    if (path.endsWith("/tn_pack_versions")) return reply([]);
    if (path.endsWith("/tn_capture_pack_version")) return rpcError ? reply({ code: rpcError, message: "private internal details" }, 400) : reply(id);
    throw new Error(path);
  };
  route = await import("../src/app/api/packs/[id]/versions/route");
});
beforeEach(() => { calls = []; visible = true; expired = false; rpcError = null; });
after(() => { globalThis.fetch = originalFetch; });
const context = { params: Promise.resolve({ id }) };
const request = (body: unknown, token = "owner-token") => new Request(`http://localhost/api/packs/${id}/versions`, {
  method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body),
});
test("capture validates before database access and sends only choices to atomic RPC", async () => {
  assert.equal((await route.POST(request(input, ""), context)).status, 401);
  assert.equal((await route.POST(request({ ...input, seeds: [] }), context)).status, 400);
  assert.equal(calls.length, 0);
  assert.equal((await route.POST(request({ ...input, snapshot: { site_id: "spoof" } }), context)).status, 201);
  assert.deepEqual(calls.at(-1)?.body, { p_id: id, p_revision: 4, p_mode: input.seed_mode, p_seeds: input.seeds });
});
test("stale capture and ownership failures preserve generic API errors", async () => {
  for (const [code, expected] of [["PT409", 409], ["PT404", 404], ["22023", 400]] as const) {
    rpcError = code; const response = await route.POST(request(input), context);
    assert.equal(response.status, expected); assert(!JSON.stringify(await response.json()).includes("private internal"));
  }
});
test("inaccessible packs never expose version contents and private responses are not cached", async () => {
  visible = false;
  const response = await route.GET(new Request(`http://localhost/api/packs/${id}/versions`), context);
  assert.equal(response.status, 404); assert(!calls.some(c => c.path.endsWith("/tn_pack_versions")));
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
});
test("expired sessions cannot capture or list private templates", async () => {
  expired = true;
  assert.equal((await route.POST(request(input), context)).status, 401);
  assert.equal((await route.GET(new Request(`http://localhost/api/packs/${id}/versions`, { headers: { Authorization: "Bearer expired" } }), context)).status, 401);
  assert(calls.every(c => c.path.endsWith("/user")));
});
