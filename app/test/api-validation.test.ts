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
