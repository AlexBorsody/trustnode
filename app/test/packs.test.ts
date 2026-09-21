import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { parsePack, parseRevision } from "../src/packs/model";
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const valid = { title: " OAuth ", description: " Evidence ", category: "security", tags: ["PKCE", "PKCE"], is_public: false,
  entries: [{ source_id: id, note: " Primary standard " }] };
test("pack normalization retains private visibility, ordering and reasons", () => {
  const next = { source_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", note: "Vendor guidance" };
  const parsed = parsePack({ ...valid, entries: [...valid.entries, next] });
  assert.equal(parsed.title, "OAuth"); assert.equal(parsed.is_public, false);
  assert.deepEqual(parsed.tags, ["PKCE"]); assert.deepEqual(parsed.entries.map(e => e.source_id), [id, next.source_id]);
  assert.equal(parsed.entries[0].note, "Primary standard");
});
for (const [name, input] of Object.entries({
  null: null, array: [], missing: {}, blank: { ...valid, title: " " }, long: { ...valid, title: "x".repeat(121) },
  visibility: { ...valid, is_public: "false" }, tags: { ...valid, tags: [3] }, manyTags: { ...valid, tags: Array(11).fill("tag") },
  empty: { ...valid, entries: [] }, many: { ...valid, entries: Array(51).fill(valid.entries[0]) },
  duplicate: { ...valid, entries: [valid.entries[0], { ...valid.entries[0], source_id: id.toUpperCase() }] },
  source: { ...valid, entries: [{ source_id: "bad", note: "" }] }, note: { ...valid, entries: [{ source_id: id, note: {} }] },
  longNote: { ...valid, entries: [{ source_id: id, note: "x".repeat(1001) }] },
})) test(`reject invalid pack: ${name}`, () => assert.throws(() => parsePack(input)));

test("mutations require an integer revision captured from the saved pack", () => {
  assert.equal(parseRevision({ revision: 7 }), 7);
  for (const revision of [undefined, null, 0, -1, 1.5, "1", 2147483648]) assert.throws(() => parseRevision({ revision }));
});

process.env.SUPABASE_URL = "https://test.invalid";
process.env.SUPABASE_ANON_KEY = "fake-public-anon-key-for-tests";
let route: typeof import("../src/app/api/packs/[id]/route");
let calls: { path: string; auth: string | null; body: Record<string, unknown> }[] = [];
let rpcError: string | null = null, invalidToken = false;
const originalFetch = globalThis.fetch;
before(async () => {
  globalThis.fetch = async (input, init) => {
    const req = new Request(input, init), path = new URL(req.url).pathname;
    calls.push({ path, auth: req.headers.get("Authorization"), body: req.method === "POST" ? await req.json() : {} });
    const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (path === "/auth/v1/user") return invalidToken ? reply({ message: "Expired" }, 401) : reply({ id, aud: "authenticated", role: "authenticated" });
    if (path.includes("/rpc/")) return rpcError ? reply({ code: rpcError, message: "internal detail must not leak" }, 400) : reply(path.endsWith("tn_delete_pack") ? id : 11);
    if (path.endsWith("/tn_packs")) return reply([{ id, revision: 7, tn_pack_sources: [{ rank: 2 }, { rank: 1 }] }]);
    throw new Error(`Unexpected request: ${path}`);
  };
  route = await import("../src/app/api/packs/[id]/route");
});
beforeEach(() => { calls = []; rpcError = null; invalidToken = false; });
after(() => { globalThis.fetch = originalFetch; });
const context = { params: Promise.resolve({ id }) };
function mutation(body: unknown, method = "PATCH", token = "owner-token") {
  return new Request(`http://localhost/api/packs/${id}`, { method, headers: {
    "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }, body: JSON.stringify(body) });
}
test("detail includes revision and sorts entries", async () => {
  const res = await route.GET(new Request(`http://localhost/api/packs/${id}`), context);
  const data = await res.json();
  assert.equal(data.pack.revision, 7); assert.deepEqual(data.pack.tn_pack_sources.map((e: { rank: number }) => e.rank), [1, 2]);
  assert.equal(res.headers.get("Cache-Control"), "private, no-store");
});
test("edit validates before database access and requires auth", async () => {
  assert.equal((await route.PATCH(mutation({ ...valid, revision: "7" }), context)).status, 400);
  assert.equal((await route.PATCH(mutation({ ...valid, revision: 7 }, "PATCH", ""), context)).status, 401);
  assert.equal(calls.length, 0);
});
test("malformed JSON and invalid pack IDs never reach the database", async () => {
  const bad = new Request(`http://localhost/api/packs/${id}`, { method: "PATCH", headers: { Authorization: "Bearer owner-token" }, body: "{" });
  assert.equal((await route.PATCH(bad, context)).status, 400);
  assert.equal((await route.DELETE(mutation({ revision: 7 }, "DELETE"), { params: Promise.resolve({ id: "bad" }) })).status, 404);
  assert.equal(calls.length, 0);
});
test("expired sessions cannot mutate packs", async () => {
  invalidToken = true;
  assert.equal((await route.PATCH(mutation({ ...valid, revision: 7 }), context)).status, 401);
  assert(!calls.some(c => c.path.includes("/rpc/")));
});
test("edit sends normalized full replacement and captured revision through caller RLS", async () => {
  const res = await route.PATCH(mutation({ ...valid, revision: 7 }), context);
  assert.equal(res.status, 200); assert.deepEqual(await res.json(), { id, revision: 11 });
  const rpc = calls.find(c => c.path.endsWith("tn_update_pack"))!;
  assert.equal(rpc.auth, "Bearer owner-token");
  assert.equal(rpc.body.p_revision, 7); assert.equal(rpc.body.p_title, "OAuth"); assert.equal(rpc.body.p_is_public, false);
  assert.deepEqual(rpc.body.p_entries, [{ source_id: id, note: "Primary standard" }]);
  assert(!("owner_id" in rpc.body));
});
test("delete requires revision and returns a confirmed deletion", async () => {
  assert.equal((await route.DELETE(mutation({}, "DELETE"), context)).status, 400);
  const res = await route.DELETE(mutation({ revision: 7 }, "DELETE"), context);
  assert.equal(res.status, 200); assert.deepEqual(await res.json(), { id, deleted: true });
  assert.deepEqual(calls.find(c => c.path.endsWith("tn_delete_pack"))?.body, { p_id: id, p_revision: 7 });
});
for (const [code, status] of [["PT409", 409], ["PT404", 404], ["23505", 400], ["PGRST202", 503]] as const) {
  test(`edit/delete report ${code} safely`, async () => {
    rpcError = code;
    for (const [handler, method, body] of [[route.PATCH, "PATCH", { ...valid, revision: 7 }], [route.DELETE, "DELETE", { revision: 7 }]] as const) {
      const res = await handler(mutation(body, method), context);
      assert.equal(res.status, status);
      assert.equal(res.headers.get("Vary"), "Authorization");
      assert(!JSON.stringify(await res.json()).includes("internal detail"));
    }
  });
}
