import assert from "node:assert/strict";
import { before, after, test } from "node:test";

// Fake configuration permits input checks; a network trap ensures malformed
// requests never reach authentication, database writes, or source retrieval.
process.env.SUPABASE_URL = "https://test.invalid";
process.env.SUPABASE_ANON_KEY = "test-placeholder-not-a-real-key";
let verify: typeof import("../src/app/api/verify/route");
let sources: typeof import("../src/app/api/sources/route");
let upload: typeof import("../src/app/api/sources/upload/route");
const originalFetch = globalThis.fetch;
let networkCalls = 0;
before(async () => {
  globalThis.fetch = async () => {
    networkCalls++;
    throw new Error("Unexpected network call in input validation test");
  };
  verify = await import("../src/app/api/verify/route");
  sources = await import("../src/app/api/sources/route");
  upload = await import("../src/app/api/sources/upload/route");
});
after(() => {
  globalThis.fetch = originalFetch;
  assert.equal(networkCalls, 0, "invalid inputs must not make upstream requests");
});
function request(body: unknown, authed = false) {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(authed ? { Authorization: "Bearer test-token" } : {}) },
    body: JSON.stringify(body),
  });
}
async function bad(response: Response) {
  assert.equal(response.status, 400);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
  assert.equal(typeof (await response.json()).error, "string");
}
for (const body of [null, [], 42, true, "claim", {}, { claim: null }, { claim: 42 }, { claim: false }, { claim: [] }, { claim: {} }, { claim: "   " }, { claim: "x".repeat(501) }]) {
  test(`verify rejects ${JSON.stringify(body).slice(0, 80)}`, async () => {
    await bad(await verify.POST(request(body)));
  });
}
test("verify rejects malformed JSON and retains preflight", async () => {
  await bad(await verify.POST(new Request("http://localhost/api/verify", { method: "POST", body: "{" })));
  const response = await verify.OPTIONS();
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
});
for (const body of [null, [], 5, {}, { url: 42 }, { url: "file:///tmp/a" }, ...["title", "description", "category", "tags"].map(key => ({ url: "https://example.com", [key]: {} })), { url: "https://example.com", tags: ["valid", 42] }]) {
  test(`sources rejects ${JSON.stringify(body)}`, async () => {
    await bad(await sources.POST(request(body, true)));
  });
}
test("source writes still require a bearer token", async () => {
  assert.equal((await sources.POST(request({ url: "https://example.com" }))).status, 401);
  assert.equal((await upload.POST(new Request("http://localhost/api/sources/upload", { method: "POST" }))).status, 401);
});
for (const key of ["file_name", "title", "description", "category", "tags"]) {
  test(`upload rejects file-valued ${key} before side effects`, async () => {
    const form = new FormData();
    form.set("file", new File(["test"], "test.txt", { type: "text/plain" }));
    // Repeated fields must not allow an invalid later value to slip through.
    form.append(key, "valid text");
    form.append(key, new File(["invalid metadata"], "metadata.txt"));
    await bad(await upload.POST(new Request("http://localhost/api/sources/upload", {
      method: "POST", headers: { Authorization: "Bearer test-token" }, body: form,
    })));
  });
}

test("authentication return paths stay within known application pages", async () => {
  const { safeReturnTo } = await import("../src/auth/returnTo");
  assert.equal(safeReturnTo("/sources"), "/sources");
  assert.equal(safeReturnTo("/explore?pack=example"), "/explore?pack=example");
  for (const value of ["https://attacker.invalid", "//attacker.invalid", "/\\attacker.invalid", "/auth/callback", "/account", "/api/packs", "/%2f%2fattacker.invalid", "javascript:alert(1)"]) {
    assert.equal(safeReturnTo(value), "/packs");
  }
});

test("SSO availability exposes only enabled supported providers and signup readiness", async () => {
  const trappedFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ external: { google: true, azure: false, email: true }, disable_signup: false, unrelated: "not-public" }));
    const { GET } = await import("../src/app/api/auth/providers/route");
    let response = await GET();
    assert.deepEqual(await response.json(), { providers: ["google"], signupEnabled: true });
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_ANON_KEY, publicUrl: process.env.NEXT_PUBLIC_SUPABASE_URL, publicKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY };
    try {
      delete process.env.SUPABASE_URL; delete process.env.SUPABASE_ANON_KEY;
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://public-config.invalid";
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "public-test-anon-key";
      response = await GET();
      assert.deepEqual(await response.json(), { providers: ["google"], signupEnabled: true });
    } finally {
      for (const [key, value] of Object.entries({ SUPABASE_URL: saved.url, SUPABASE_ANON_KEY: saved.key, NEXT_PUBLIC_SUPABASE_URL: saved.publicUrl, NEXT_PUBLIC_SUPABASE_ANON_KEY: saved.publicKey })) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
    }
    globalThis.fetch = async () => new Response("unavailable", { status: 503 });
    response = await GET();
    assert.equal(response.status, 503);
  } finally { globalThis.fetch = trappedFetch; }
});


test("source editing rejects malformed fields before owner or database calls", async () => {
  const { PATCH } = await import("../src/app/api/sources/[id]/route");
  const params = Promise.resolve({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
  for (const body of [null, [], { title: 1 }, { description: {} }, { category: [] }, { tags: [4] }]) {
    const response = await PATCH(new Request("http://localhost/api/sources/example", {
      method: "PATCH", headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" }, body: JSON.stringify(body),
    }), { params });
    assert.equal(response.status, 400);
  }
});

test("a referenced source deletion preserves its backing file", async () => {
  const trappedFetch = globalThis.fetch;
  const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const requests: string[] = [];
  try {
    globalThis.fetch = async (input, init) => {
      const request = new Request(input, init), path = new URL(request.url).pathname;
      requests.push(`${request.method} ${path}`);
      const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
      if (path.endsWith("/user")) return reply({ id });
      if (request.method === "DELETE") return reply({ code: "23503", message: "private pack detail" }, 409);
      return reply({ id, owner_id: id, kind: "file", file_path: "test/file.pdf" });
    };
    const { DELETE } = await import("../src/app/api/sources/[id]/route");
    const response = await DELETE(new Request(`http://localhost/api/sources/${id}`, { method: "DELETE", headers: { Authorization: "Bearer test-token" } }), { params: Promise.resolve({ id }) });
    assert.equal(response.status, 409);
    assert(!JSON.stringify(await response.json()).includes("private pack detail"));
    assert(!requests.some(path => path.includes("/storage/")));
  } finally { globalThis.fetch = trappedFetch; }
});
