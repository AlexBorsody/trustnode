import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRelationship, parseEvidenceReview } from "../src/sources/relationships";
process.env.SUPABASE_URL = "https://evidence-fixture.invalid";
process.env.SUPABASE_ANON_KEY = "fixture-key-not-a-real-secret";
const a="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", b="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", v="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const evidence = { source_id:a, target_id:b, relation:"cites", rationale:"A cites B", source_locator:"Section 2", source_quote:"See B", observed_on:"2026-09-21" };

test("evidence inputs separate scoped proposals from reviewed acceptance", () => {
  assert.equal(parseRelationship({template_version_id:v,evidence}).evidence.source_quote,"See B");
  assert.throws(() => parseRelationship({template_version_id:v,evidence:{...evidence,target_id:a}}));
  assert.throws(() => parseRelationship({template_version_id:v,evidence:{...evidence,relation:"contradicts"}}));
  assert.throws(() => parseRelationship({template_version_id:v,evidence:{...evidence,observed_on:"2026-02-30"}}));
  assert.throws(() => parseRelationship({template_version_id:v,edge_id:a,evidence}));
  assert.throws(() => parseEvidenceReview({action:"accept",reason:"Looks fine"}));
  assert.throws(() => parseEvidenceReview({action:"challenge",reason:"Disagree"}));
});

test("evidence APIs retain revision tokens, private 404s and generic failures", async () => {
  const original = globalThis.fetch;
  let mode = "save", rpc: Record<string,unknown> = {};
  try {
    globalThis.fetch = async (input, init) => {
      const req = new Request(input, init), path = new URL(req.url).pathname;
      if (path.endsWith("/user")) return new Response(JSON.stringify({id:a}));
      if (path.includes("/rpc/")) {
        rpc = await req.json();
        return new Response(JSON.stringify(mode==="conflict" ? {code:"PT409",message:"private detail"} : {revision_id:b}),{status:mode==="conflict"?409:200});
      }
      return new Response("[]");
    };
    const {POST,GET} = await import("../src/app/api/relationships/route");
    const review = await import("../src/app/api/relationships/revisions/[id]/reviews/route");
    const req = (body: unknown) => new Request("https://example.org/api/relationships",{method:"POST",headers:{Authorization:"Bearer fixture","Content-Type":"application/json"},body:JSON.stringify(body)});
    let result = await POST(req({template_version_id:v,edge_id:a,previous_revision_id:b,evidence}));
    assert.equal(result.status,201); assert.equal(rpc.p_previous,b); assert.equal(rpc.p_version,v);
    result = await review.POST(req({action:"withdraw",reason:"Changed evidence",expected_decision_id:12}),{params:Promise.resolve({id:b})});
    assert.equal(result.status,201); assert.equal(rpc.p_expected_decision,12); assert.equal(rpc.p_revision,b);
    mode="conflict";
    result = await POST(req({template_version_id:v,edge_id:a,previous_revision_id:b,evidence}));
    assert.equal(result.status,409); assert(!JSON.stringify(await result.json()).includes("private detail"));
    result = await GET(new Request(`https://example.org/api/relationships?template_version=${v}`));
    assert.equal(result.status,404); assert.equal(result.headers.get("Cache-Control"),"private, no-store");
  } finally { globalThis.fetch = original; }
});
