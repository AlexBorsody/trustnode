import assert from "node:assert/strict";
import {test} from "node:test";
import {parseTemplateMerge} from "../src/packs/template-merge";
process.env.SUPABASE_URL="https://merge-fixture.invalid";
process.env.SUPABASE_ANON_KEY="fixture-public-key-not-a-secret";
const a="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",b="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const input={parents:[a,b].map(version_id=>({version_id,content_hash:'a'.repeat(64),evidence_revision:1,visibility_epoch:1})),
  title:'Reconciled child',metadata_version:a,seed_mode:'ordered-seeds-v1',copy_evidence:true,request_key:a,
  entries:[{source_id:a,metadata_version:b,is_seed:true,rationale:'Selected rationale'}]};
test('merge requires explicit policy, unique members and resolved metadata',()=>{
  assert.equal(parseTemplateMerge(input).entries[0].metadata_version,b);
  for(const changed of [{seed_mode:undefined},{parents:[input.parents[0],input.parents[0]]},{copy_evidence:undefined},
    {entries:[{...input.entries[0],metadata_version:''}]},{entries:[input.entries[0],input.entries[0]]},{entries:[{...input.entries[0],is_seed:false,rationale:''}]}]) {
    assert.throws(()=>parseTemplateMerge({...input,...changed}));
  }
});
test('merge API forwards explicit reconciliation and hides private/stale internals',async()=>{
  const saved=globalThis.fetch;let mode='success',payload:unknown,calls=0;
  globalThis.fetch=async(url,init)=>{
    const req=new Request(url,init);if(new URL(req.url).pathname.endsWith('/user'))return new Response(JSON.stringify({id:a}));
    calls++;payload=await req.json();
    if(mode==='hidden')return new Response('null');
    if(mode==='stale')return new Response(JSON.stringify({code:'PT409',message:'private parent IDs'}),{status:409});
    return new Response(JSON.stringify({pack_id:a,version_id:a,copied_evidence:1,reused:mode==='retry'}));
  };
  try{
    const {POST}=await import('../src/app/api/templates/merge/route');const {GET}=await import('../src/app/api/templates/[id]/merge/route');
    const req=(auth=true)=>new Request('https://example.org/merge',{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer fixture'}:{})},body:JSON.stringify(input)});
    assert.equal((await POST(req(false))).status,401);assert.equal(calls,0);
    const response=await POST(req());assert.equal(response.status,201,await response.clone().text());assert.equal(response.headers.get('Cache-Control'),'private, no-store');
    assert.deepEqual(payload,{p_input:input});mode='retry';assert.equal((await POST(req())).status,200);
    mode='stale';const conflict=await POST(req());assert.equal(conflict.status,409);assert(!(await conflict.text()).includes('private parent IDs'));
    mode='hidden';assert.equal((await GET(new Request('https://example.org/merge'),{params:Promise.resolve({id:a})})).status,404);
  }finally{globalThis.fetch=saved;}
});
