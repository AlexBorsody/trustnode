import assert from "node:assert/strict";
import { test } from "node:test";
import { parseTemplateFork } from "../src/packs/template-fork";
process.env.SUPABASE_URL="https://fork-fixture.invalid";
process.env.SUPABASE_ANON_KEY="fixture-key-not-a-secret";
const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const input={content_hash:'a'.repeat(64),evidence_revision:3,visibility_epoch:2,copy_evidence:false,title:'Independent fork',request_key:id};
test('template fork requires explicit evidence choice and captured tokens',()=>{
  assert.equal(parseTemplateFork(input).copy_evidence,false);
  assert.throws(()=>parseTemplateFork({...input,copy_evidence:undefined}));
  assert.throws(()=>parseTemplateFork({...input,evidence_revision:0}));
  assert.throws(()=>parseTemplateFork({...input,visibility_epoch:0}));
  assert.throws(()=>parseTemplateFork({...input,request_key:'invalid'}));
});
test('template fork API preserves selected version and returns generic private/stale failures',async()=>{
  const saved=globalThis.fetch; let calls=0, params: Record<string,unknown>={}, mode='success';
  globalThis.fetch=async(url,init)=>{
    const req=new Request(url,init),path=new URL(req.url).pathname;
    if(path.endsWith('/user'))return new Response(JSON.stringify({id}));
    calls++;params=await req.json();
    if(mode==='hidden')return new Response('null');
    if(mode==='stale')return new Response(JSON.stringify({code:'PT409',message:'private internals'}),{status:409});
    return new Response(JSON.stringify({pack_id:id,version_id:id,copied_evidence:0,reused:mode==='retry'}));
  };
  try {
    const {GET,POST}=await import('../src/app/api/templates/[id]/fork/route');
    const context={params:Promise.resolve({id})};
    const req=(token=true)=>new Request('https://example.org/fork',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer fixture'}:{})},body:JSON.stringify(input)});
    assert.equal((await POST(req(false),context)).status,401);assert.equal(calls,0);
    const created=await POST(req(),context);assert.equal(created.status,201);assert.equal(created.headers.get('Cache-Control'),'private, no-store');
    assert.deepEqual(params,{p_version:id,p_hash:input.content_hash,p_evidence_revision:3,p_visibility_epoch:2,p_copy_evidence:false,p_title:input.title,p_request_key:id});
    mode='retry';assert.equal((await POST(req(),context)).status,200);
    mode='stale';const stale=await POST(req(),context);assert.equal(stale.status,409);assert(!(await stale.text()).includes('private internals'));
    mode='hidden';assert.equal((await GET(new Request('https://example.org/fork'),context)).status,404);
  } finally {globalThis.fetch=saved;}
});
