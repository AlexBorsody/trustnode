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

test("metadata fetch destinations reject internal and encoded private IPs", async () => {
  const { publicAddress, metadataUrl } = await import("../src/sources/link-meta");
  for (const ip of ["127.0.0.1", "10.0.0.1", "169.254.169.254", "172.16.1.1", "192.168.1.1", "100.64.0.1", "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1", "2001:db8::1"]) assert.equal(publicAddress(ip), false, ip);
  for (const value of ["http://2130706433", "http://0x7f000001", "http://[::ffff:127.0.0.1]", "http://localhost", "https://user:pass@example.com", "http://example.com:9000"]) assert.throws(() => metadataUrl(value));
  assert(publicAddress("8.8.8.8")); assert(publicAddress("2606:4700:4700::1111"));
  assert.equal(metadataUrl("https://example.com:443/page").href, "https://example.com/page");
});

test("source creation and edits use one atomic metadata/tag RPC with generic errors", async () => {
  const trappedFetch = globalThis.fetch;
  const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  let errorCode: string | null = null;
  const calls: { path: string; body?: Record<string, unknown> }[] = [];
  try {
    globalThis.fetch = async (input, init) => {
      const req = new Request(input, init), path = new URL(req.url).pathname;
      calls.push({ path, body: req.method === "POST" ? await req.json() : undefined });
      const body = path.endsWith("/user") ? { id } : path.endsWith("/tn_sources") ? [] : errorCode ? { code: errorCode, message: "private schema detail" } : { id, status: "ready" };
      return new Response(JSON.stringify(body), { status: path.endsWith("/tn_save_source") && errorCode ? 400 : 200, headers: { "Content-Type": "application/json" } });
    };
    const { PATCH } = await import("../src/app/api/sources/[id]/route");
    let response = await sources.POST(request({ url: "https://example.com/page", title: "Primary", description: "Evidence", tags: ["OAuth", "oauth"] }, true));
    assert.equal(response.status, 201);
    assert.deepEqual(calls.at(-1)?.body?.p_tags, [{ slug: "oauth", label: "OAuth" }]);
    assert.equal(calls.at(-1)?.path, "/rest/v1/rpc/tn_save_source");
    response = await PATCH(request({ title: "Edited", tags: [] }, true), { params: Promise.resolve({ id }) });
    assert.equal(response.status, 200); assert.deepEqual(calls.at(-1)?.body, { p_id: id, p_data: { title: "Edited" }, p_tags: [] });
    assert(!calls.some(c => /tn_tags|tn_source_tags/.test(c.path)));
    errorCode = "23505";
    response = await sources.POST(request({ url: "https://example.com/page", title: "Duplicate", description: "Evidence" }, true));
    assert.equal(response.status, 409); assert(!JSON.stringify(await response.json()).includes("private schema"));
  } finally { globalThis.fetch = trappedFetch; }
});

test("verification reads bounded descriptions with a stable tie-breaker", async () => {
  const trappedFetch = globalThis.fetch; let selected = "", order = "";
  try {
    globalThis.fetch = async (input, init) => {
      const url = new URL(new Request(input, init).url);
      selected = url.searchParams.get("select") ?? ""; order = url.searchParams.get("order") ?? "";
      return new Response("[]", { headers: { "Content-Type": "application/json" } });
    };
    assert.equal((await verify.POST(request({ claim: "PKCE uses a code verifier" }))).status, 200);
    assert(!selected.includes("extracted_text")); assert(order.includes("id.asc"));
  } finally { globalThis.fetch = trappedFetch; }
});

test("uploads reject active HTML and oversize files before database access", async () => {
  for (const file of [new File(["<script>alert(1)</script>"], "page.html", { type: "text/html" }), new File([new Uint8Array(4 * 1024 * 1024 + 1)], "large.txt", { type: "text/plain" })]) {
    const form = new FormData(); form.set("file", file);
    await bad(await upload.POST(new Request("http://localhost/api/sources/upload", { method: "POST", headers: { Authorization: "Bearer fixture" }, body: form })));
  }
});

test("file registration cleans up a rejected save but preserves an uncertain one", async () => {
  const trappedFetch = globalThis.fetch;
  const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  try {
    for (const [code, expectedStatus, shouldRemove] of [["22023", 400, true], ["", 503, false]] as const) {
      let removed = false;
      globalThis.fetch = async (input, init) => {
        const req = new Request(input, init), path = new URL(req.url).pathname;
        if (req.method === "DELETE") removed = true;
        const rpc = path.endsWith("/tn_save_source");
        return new Response(JSON.stringify(path.endsWith("/user") ? { id } : rpc ? { code, message: "save failed" } : {}), {
          status: rpc ? 400 : 200, headers: { "Content-Type": "application/json" },
        });
      };
      const form = new FormData();
      form.set("file", new File(["Source evidence"], "source.txt", { type: "text/plain" }));
      const response = await upload.POST(new Request("http://localhost/api/sources/upload", {
        method: "POST", headers: { Authorization: "Bearer fixture" }, body: form,
      }));
      assert.equal(response.status, expectedStatus); assert.equal(removed, shouldRemove);
    }
  } finally { globalThis.fetch = trappedFetch; }
});
