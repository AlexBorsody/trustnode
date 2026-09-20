import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { buildCandidates, parseRetrieval, type ShelfSource, type PublicPack, type SelectedPack } from "../src/trustnode/retrieval";
const sid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", pid = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const source: ShelfSource = { id: sid, title: "PKCE client source", url: "https://example.org/pkce", excerpt: "PKCE public client interception", kind: "link", status: "ready" };
const pack: PublicPack = { id: pid, owner_id: "curator", tn_pack_sources: [{ source_id: sid, rank: 1, tn_sources: { url: source.url } }] };
const selected: SelectedPack = { id: pid, title: "Private PKCE pack", is_public: false, tn_pack_sources: [{ source_id: sid, rank: 1, tn_sources: source }] };
test("request defaults and normalization", () => {
  assert.deepEqual(parseRetrieval({ query: " PKCE " }), { query: "PKCE", limit: 6, use_pack_signals: true });
  assert.equal(parseRetrieval({ query: "PKCE", pack_id: pid.toUpperCase() }).pack_id, pid);
});
for (const body of [null, [], {}, { query: 42 }, { query: " " }, { query: "x".repeat(501) }, { query: "PKCE", limit: 0 }, { query: "PKCE", limit: 21 }, { query: "PKCE", limit: 1.5 }, { query: "PKCE", limit: "6" }, { query: "PKCE", use_pack_signals: "false" }, { query: "PKCE", pack_id: "bad" }]) {
  test(`invalid controls: ${JSON.stringify(body).slice(0, 75)}`, () => assert.throws(() => parseRetrieval(body)));
}
test("exact URLs bridge shelf adoption to seeds without duplicate results", () => {
  const seedUrl = "https://www.rfc-editor.org/rfc/rfc7636";
  const results = buildCandidates([{ ...source, url: seedUrl }], [{ ...pack, tn_pack_sources: [{ source_id: sid, rank: 1, tn_sources: { url: seedUrl } }] }]);
  const found = results.filter(r => r.url === seedUrl);
  assert.equal(found.length, 1); assert.equal(found[0].origin, "seed");
  assert.equal(found[0].pack_references?.[0].pack_id, pid);
});
test("explorer excludes illustrative and non-http source URLs", () => {
  const candidates = buildCandidates([{ ...source, url: "javascript:alert(1)" }, { ...source, id: "another", url: "https://example.invalid/fixture" }], []);
  assert(candidates.every(c => !c.url.includes(".invalid") && c.url.startsWith("https:")));
});
test("private pack restricts corpus without entering adoption", () => {
  const candidates = buildCandidates([], [], selected);
  assert.equal(candidates.length, 1); assert.equal(candidates[0].url, source.url);
  assert.deepEqual(candidates[0].pack_references, []);
});
test("pending, file and missing selected entries are not searchable", () => {
  assert.deepEqual(buildCandidates([], [], { ...selected, tn_pack_sources: [
    { source_id: sid, rank: 1, tn_sources: { ...source, status: "pending" } },
    { source_id: sid, rank: 2, tn_sources: { ...source, kind: "file" } },
    { source_id: sid, rank: 3, tn_sources: null },
  ] }), []);
});
test("duplicate shelf URLs use a stable representative", () => {
  const rows = [source, { ...source, id: "zzzz", title: "duplicate" }];
  assert.deepEqual(buildCandidates(rows, []), buildCandidates([...rows].reverse(), []));
});

process.env.SUPABASE_URL = "https://test.invalid";
process.env.SUPABASE_ANON_KEY = "fake-public-anon-key-for-tests";
let route: typeof import("../src/app/api/retrieve/route");
let packUnavailable = false, shelfUnavailable = false, privateVisible = true, invalidToken = false;
let calls: { url: URL; auth: string | null }[] = [];
const originalFetch = globalThis.fetch;
before(async () => {
  globalThis.fetch = async (input, init) => {
    const req = new Request(input, init); const url = new URL(req.url);
    calls.push({ url, auth: req.headers.get("Authorization") });
    const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (url.pathname === "/auth/v1/user") return invalidToken ? reply({ message: "expired" }, 401) : reply({ id: sid, aud: "authenticated", role: "authenticated" });
    if (url.pathname.endsWith("/tn_sources")) return shelfUnavailable ? reply({ code: "42P01", message: "unavailable" }, 404) : reply([source]);
    if (url.pathname.endsWith("/tn_packs")) {
      if (url.searchParams.has("id")) return reply(privateVisible ? [selected] : []);
      return packUnavailable ? reply({ code: "42P01", message: "unavailable" }, 404) : reply([pack]);
    }
    throw new Error(`Unexpected call: ${url}`);
  };
  route = await import("../src/app/api/retrieve/route");
});
beforeEach(() => { calls = []; packUnavailable = false; shelfUnavailable = false; privateVisible = true; invalidToken = false; });
after(() => { globalThis.fetch = originalFetch; });
function request(body: unknown, token?: string) { return new Request("http://localhost/api/retrieve", { method: "POST",
  headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }); }
test("route rejects invalid input before any database calls and keeps CORS", async () => {
  const response = await route.POST(request({ query: 5 })); assert.equal(response.status, 400);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*"); assert.equal(calls.length, 0);
  assert.equal((await route.OPTIONS()).status, 204);
});
test("global pack adoption is explicitly public and never uses caller credentials", async () => {
  const response = await route.POST(request({ query: "PKCE" }, "private-user-token")); assert.equal(response.status, 200);
  const data = await response.json(); assert.equal(data.corpus.pack_status, "available");
  const read = calls.find(c => c.url.pathname.endsWith("/tn_packs"))!;
  assert.equal(read.url.searchParams.get("is_public"), "eq.true");
  assert.equal(read.auth, "Bearer fake-public-anon-key-for-tests");
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
});
test("unavailable pack schema is labeled while sources remain usable", async () => {
  packUnavailable = true;
  const response = await route.POST(request({ query: "PKCE" })); assert.equal(response.status, 200);
  const data = await response.json(); assert.equal(data.corpus.pack_status, "unavailable");
  assert(data.warnings.length); assert(data.results.length > 0);
});
test("unavailable shelf does not disable seeds", async () => {
  shelfUnavailable = true;
  const data = await (await route.POST(request({ query: "PKCE" }))).json();
  assert.equal(data.corpus.shelf_status, "unavailable"); assert(data.results.some((s: { origin: string }) => s.origin === "seed"));
});
test("private selected-pack filtering leaves public adoption anonymous", async () => {
  const data = await (await route.POST(request({ query: "PKCE", pack_id: pid }, "private-user-token"))).json();
  assert.equal(data.selected_pack.id, pid); assert.equal(data.results.length, 1);
  assert.equal(calls.find(c => c.url.searchParams.has("id"))?.auth, "Bearer private-user-token");
  assert.equal(calls.find(c => c.url.searchParams.has("is_public"))?.auth, "Bearer fake-public-anon-key-for-tests");
});
test("private or missing selected pack returns generic 404 without fallback", async () => {
  privateVisible = false;
  const response = await route.POST(request({ query: "PKCE", pack_id: pid }));
  assert.equal(response.status, 404); assert.match((await response.json()).error, /not found or private/);
  assert.equal(calls.length, 1);
});
test("expired token cannot read private packs", async () => {
  invalidToken = true;
  assert.equal((await route.POST(request({ query: "PKCE", pack_id: pid }, "expired"))).status, 401);
  assert(!calls.some(c => c.url.pathname.endsWith("/tn_packs")));
});
test("retrieval controls and selected packs never change canonical confidence", async () => {
  const base = await (await route.POST(request({ query: "PKCE public client interception", use_pack_signals: false, limit: 1 }))).json();
  const changed = await (await route.POST(request({ query: "PKCE public client interception", pack_id: pid, use_pack_signals: true, limit: 20 }))).json();
  assert.deepEqual(changed.canonical_verification, base.canonical_verification);
});
