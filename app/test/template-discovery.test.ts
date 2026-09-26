import assert from "node:assert/strict";
import { test } from "node:test";
import { discoveryCursor, parseDiscoveryQuery } from "../src/packs/template-discovery";
import { safeReturnTo } from "../src/auth/returnTo";
process.env.SUPABASE_URL = "https://discovery-fixture.invalid";
process.env.SUPABASE_ANON_KEY = "fixture-public-key-not-a-secret";
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
test("discovery cursors preserve microsecond ties and bind to normalized category", () => {
  const next = { id, created_at: "2026-09-25T12:34:56.123456+00:00" };
  const cursor = discoveryCursor(next, "security > oauth")!;
  assert.deepEqual(parseDiscoveryQuery(new URLSearchParams({ category: " Security > OAuth ", cursor })).before, next);
  assert.equal(discoveryCursor(null, null), null);
  assert.equal(safeReturnTo("/templates?category=Security"), "/templates?category=Security");
  for (const query of ["limit=26", "limit=", "category=a>>b", "category=a&category=b", "cursor=bad", "cursor=" + cursor, "offset=1"]) {
    assert.throws(() => parseDiscoveryQuery(new URLSearchParams(query)));
  }
});
test("discovery authenticates supplied sessions and emits only a visible-row cursor", async () => {
  const saved = globalThis.fetch; let mode = "ok", payload: unknown, auth = "", calls = 0;
  globalThis.fetch = async (url, init) => {
    const req = new Request(url, init);
    if (req.url.endsWith("/user")) return mode === "badAuth" ? new Response('{"message":"invalid"}', { status: 401 }) : new Response(JSON.stringify({ id }));
    calls++; payload = await req.json(); auth = req.headers.get("authorization") ?? "";
    if (mode === "error") return new Response('{"code":"42501","message":"hidden template metadata"}', { status: 400 });
    return new Response(JSON.stringify({ templates: [{ id }], next: { id, created_at: "2026-09-25T12:34:56.123456+00:00" }, adoption_scope: { public_packs_considered: 3 } }));
  };
  try {
    const { GET } = await import("../src/app/api/templates/route");
    const req = (query = "", token = "") => new Request(`https://example.org/api/templates${query}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    assert.equal((await GET(req("?limit=100"))).status, 400); assert.equal(calls, 0);
    const first = await GET(req("?category=Security&limit=2")); assert.equal(first.status, 200);
    assert.equal(first.headers.get("Cache-Control"), "private, no-store"); assert.equal(first.headers.get("Vary"), "Authorization");
    const page = await first.json(); assert(!("next" in page));
    await GET(req(`?category=Security&limit=2&cursor=${page.next_cursor}`, "fixture-session"));
    assert.deepEqual(payload, { p_category: "security", p_limit: 2, p_before_time: "2026-09-25T12:34:56.123456+00:00", p_before_id: id });
    assert.equal(auth, "Bearer fixture-session");
    mode = "badAuth"; const before = calls; assert.equal((await GET(req("", "expired"))).status, 401); assert.equal(calls, before);
    mode = "error"; const failed = await GET(req()); assert.equal(failed.status, 503); assert(!(await failed.text()).includes("hidden template"));
  } finally { globalThis.fetch = saved; }
});
