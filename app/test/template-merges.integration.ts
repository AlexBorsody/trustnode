import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {workOnce,type SqlClient} from "../worker/graph";
import {seedDistribution} from "../src/packs/templates";
const OWNER="55555555-5555-4555-8555-555555555555",OTHER="66666666-6666-4666-8666-666666666666";
export async function runTemplateMergeIntegration(db:SqlClient,connection?:()=>Promise<SqlClient&{end():Promise<void>}>) {
  await db.query('reset role');await db.query('insert into auth.users values($1),($2)',[OWNER,OTHER]);
  const role=async(id:string|null)=>{await db.query(id?'set role authenticated':'set role anon');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id??'']);};
  const value=async(sql:string,args:unknown[]=[]) => (await db.query(sql,args)).rows[0].value;
  const rejects=(code:string,p:Promise<unknown>)=>assert.rejects(p,e=>(e as {code?:string}).code===code);
  const readInfo=(v:string)=>value('select tn_template_merge_info($1) as value',[v]);
  const evidence=(v:string)=>value('select tn_list_relationships($1,0) as value',[v]);
  const merge=(input:unknown)=>value('select tn_merge_templates($1::jsonb) as value',[JSON.stringify(input)]);
  const changeNote=(pack:string,source:string,note:string)=>db.query("select tn_update_pack(p.id,p.revision,p.title,p.description,p.category,p.tags,p.is_public,(select jsonb_agg(jsonb_build_object('source_id',s.source_id,'note',case when s.source_id=$2 then $3 else s.note end) order by s.rank) from tn_pack_sources s where s.pack_id=p.id)) from tn_packs p where p.id=$1",[pack,source,note]);
  await role(OWNER);const ids:string[]=[];
  for(const label of ['a','b','c','d']) ids.push((await value('select tn_save_source(null,$1::jsonb,null) as value',[JSON.stringify({kind:'link',title:`Merge ${label}`,url:`https://merge-${label}.example/`,excerpt:'Synthetic merge fixture'})])).id);
  const base=await value("select tn_create_pack('Common base','','Merge fixture','{}',true,$1::jsonb) as value",[JSON.stringify(ids.map(source_id=>({source_id,note:'Original note'})))]);
  const root=await value("select tn_capture_pack_version($1,(select revision from tn_packs where id=$1),'ordered-seeds-v1',$2::jsonb) as value",[base,JSON.stringify(ids.slice(0,2).map(source_id=>({source_id,rationale:'Parent seed rationale'})))]);
  const body={source_id:ids[0],target_id:ids[2],relation:'cites',rationale:'Shared assertion',source_locator:'Section 1',source_quote:'A references C',observed_on:'2026-09-24'};
  const proposal=async(v:string,b=body)=>value('select tn_save_relationship($1,null,null,$2::jsonb) as value',[v,JSON.stringify(b)]);
  await proposal(root);const rootInfo=(await readInfo(root)).info;
  const fork=()=>value('select tn_fork_template($1,$2,$3,$4,true,$5,$6) as value',[root,rootInfo.content_hash,rootInfo.evidence_revision,rootInfo.visibility_epoch,'Divergent fork',randomUUID()]);
  const left=await fork();await db.query('update tn_packs set is_public=true where id=$1',[left.pack_id]);
  await proposal(left.version_id,{...body,rationale:'Independent additional support'});
  await proposal(left.version_id,{...body,source_id:ids[1],target_id:ids[3],rationale:'Excluded member assertion'});
  for(const row of await evidence(left.version_id))await db.query("select tn_review_relationship($1,'accept','Left reviewed',null,true,'','',null)",[row.current_revision.id]);
  await role(OTHER);const right=await fork();
  await changeNote(right.pack_id,ids[0],'Right captured note');
  const rightVersion=await value("select tn_capture_pack_version($1,(select revision from tn_packs where id=$1),'uniform-seeds-v1',$2::jsonb) as value",[right.pack_id,JSON.stringify([{source_id:ids[1],rationale:'Right seed only'}])]);
  const rightEdge=await proposal(rightVersion);await db.query("select tn_review_relationship($1,'accept','Right reviewed',null,true,'','',null)",[rightEdge.revision_id]);
  const tokens=async()=>Promise.all([left.version_id,rightVersion].map(async v=>{const p=await readInfo(v);return {version_id:v,content_hash:p.version.content_hash,evidence_revision:p.info.evidence_revision,visibility_epoch:p.info.visibility_epoch};}));
  let input={parents:await tokens(),metadata_version:rightVersion,title:'Explicit merged child',seed_mode:'ordered-seeds-v1',copy_evidence:true,request_key:randomUUID(),
    entries:[{source_id:ids[2],metadata_version:left.version_id,is_seed:false,rationale:''},
      {source_id:ids[1],metadata_version:rightVersion,is_seed:true,rationale:'First chosen seed'},
      {source_id:ids[0],metadata_version:rightVersion,is_seed:true,rationale:'Second chosen seed'}]};
  const beforeParents=JSON.stringify(await Promise.all([left.version_id,rightVersion].map(evidence)));
  await changeNote(right.pack_id,ids[0],'Later mutable note');
  const originalInput=input;
  const child=await merge(input);assert.equal(child.copied_evidence,2,'identical bodies deduplicate and excluded endpoints are omitted');
  assert.equal((await merge(input)).version_id,child.version_id);await rejects('PT409',merge({...input,title:'Changed retry'}));
  const saved=(await readInfo(child.version_id)).version;
  assert.equal(saved.snapshot.entries[2].note,'Right captured note');assert.equal(saved.snapshot.seed_mode,'ordered-seeds-v1');
  assert.deepEqual(saved.snapshot.entries.map((e:any)=>e.source_id),[ids[2],ids[1],ids[0]]);
  assert.deepEqual(seedDistribution(saved.snapshot.entries,saved.snapshot.seed_mode).resources.map(r=>r.mass),[2/3,1/3]);
  assert.equal(await value('select is_public as value from tn_packs where id=$1',[child.pack_id]),false);
  let copied=await evidence(child.version_id);assert(copied.every((e:any)=>e.current_decision===null&&e.creation_kind==='template-import'&&e.author_id===OTHER));
  const shared=copied.find((e:any)=>e.current_revision.body.rationale==='Shared assertion');assert.equal(shared.origins.length,2);
  assert.equal((await readInfo(child.version_id)).info.origins.length,2);
  const compute=async()=>{
    await db.query('set role tn_graph_worker');await workOnce(db);await role(OTHER);
    const t=(await readInfo(child.version_id)),rev=await value('select revision as value from tn_packs where id=$1',[child.pack_id]);
    const run=await value('select tn_enqueue_trust_run($1,$2,$3,$4) as value',[child.version_id,rev,t.info.evidence_revision,randomUUID()]);
    await db.query('set role tn_graph_worker');assert.equal((await workOnce(db)).state,'completed');await role(OTHER);
    return {id:run.run_id,raw:await value("select tn_read_trust_run($1,'raw') as value",[run.run_id]),input:(await value("select tn_read_trust_run($1,'input') as value",[run.run_id])).text};
  };
  assert.equal((await compute()).raw.results.resource.evidence_state,'seed_only');
  for(const row of copied)await db.query("select tn_review_relationship($1,'accept','Child reviewed',null,true,'','',null)",[row.current_revision.id]);
  const run=await compute();assert.equal(run.raw.graph.resource.edges.length,1,'distinct supports count as one directed pair');
  assert(run.raw.results.resource.scores.find((s:any)=>s.node_id===ids[2]).mass>0);
  assert.equal(JSON.stringify(await Promise.all([left.version_id,rightVersion].map(evidence))),beforeParents);
  for(const hidden of [left.pack_id,left.version_id,right.pack_id,rightVersion,OWNER,rightEdge.revision_id])assert(!run.input.includes(hidden));
  const ownedCount=()=>value('select count(*)::integer as value from tn_packs where owner_id=$1',[OTHER]);
  const countBefore=await ownedCount();
  await rejects('22023',merge({...input,request_key:randomUUID(),entries:[{...input.entries[0],metadata_version:root}]}));
  await db.query("select tn_review_relationship($1,'challenge','Scope check',null,false,'Section 2','Synthetic challenge',null)",[rightEdge.revision_id]);
  await rejects('PT409',merge({...input,request_key:randomUUID()}));assert.equal(await ownedCount(),countBefore);
  input={...input,parents:await tokens(),request_key:randomUUID()};
  if(connection){
    const first=await connection(),second=await connection();
    try{
      for(const c of [first,second]){await c.query('set role authenticated');await c.query("select set_config('request.jwt.claim.sub',$1,false)",[OTHER]);}
      await first.query('begin');const request=JSON.stringify(input);
      const created=(await first.query('select tn_merge_templates($1::jsonb) as value',[request])).rows[0].value;
      const duplicate=second.query('/* merge_retry_race */ select tn_merge_templates($1::jsonb) as value',[request]);
      await db.query('reset role');let blocked=false;
      for(let i=0;i<100;i++){blocked=await value("select exists(select 1 from pg_stat_activity where query like '/* merge_retry_race */%' and wait_event_type='Lock') as value");if(blocked)break;await new Promise(r=>setTimeout(r,10));}
      assert(blocked,'duplicate request waits on the same request key');await first.query('commit');assert.equal((await duplicate).rows[0].value.version_id,created.version_id);
      await role(OTHER);const staleInput={...input,parents:await tokens(),request_key:randomUUID()};
      await first.query('begin');await first.query("select tn_review_relationship($1,'challenge','Concurrent review',null,false,'Section 3','Synthetic challenge',null)",[rightEdge.revision_id]);
      const stale=second.query('/* merge_evidence_race */ select tn_merge_templates($1::jsonb)',[JSON.stringify(staleInput)]).then(()=> 'unexpected success',e=>e.code);
      await db.query('reset role');blocked=false;
      for(let i=0;i<100;i++){blocked=await value("select exists(select 1 from pg_stat_activity where query like '/* merge_evidence_race */%' and wait_event_type='Lock') as value");if(blocked)break;await new Promise(r=>setTimeout(r,10));}
      assert(blocked,'merge waits for the second parent evidence transaction');await first.query('commit');assert.equal(await stale,'PT409');await role(OTHER);
      console.log('Concurrent merge retry serialization and second-parent evidence fencing passed');
    }finally{await first.query('rollback').catch(()=>{});await second.query('rollback').catch(()=>{});await first.end();await second.end();}
  }
  for(let i=0;i<198;i++)await proposal(rightVersion);
  const overLimit={...input,parents:await tokens(),request_key:randomUUID()};const beforeLimit=await ownedCount();
  await rejects('PT422',merge(overLimit));assert.equal(await ownedCount(),beforeLimit);
  const fresh={...input,parents:await tokens(),request_key:randomUUID(),copy_evidence:false};const deleted=await merge(fresh);
  await db.query('delete from tn_packs where id=$1',[deleted.pack_id]);await rejects('PT404',merge(fresh));
  await db.query('update tn_packs set is_public=true where id=$1',[child.pack_id]);
  await role(OWNER);await db.query('update tn_packs set is_public=false where id=$1',[left.pack_id]);
  await role(OTHER);const hiddenCount=await ownedCount();await rejects('PT404',merge({...input,request_key:randomUUID()}));assert.equal(await ownedCount(),hiddenCount);
  assert.equal((await merge(originalInput)).version_id,child.version_id,'owned child retry survives hidden parent');
  const info=(await readInfo(child.version_id)).info;assert.equal(info.origins.length,1);assert.equal(info.origins[0].version_id,rightVersion);
  copied=await evidence(child.version_id);assert.equal(copied.find((e:any)=>e.id===shared.id).origins.length,1);
  await role(null);const publicRows=await evidence(child.version_id);assert(publicRows.every((e:any)=>e.origins.length===0),'both private parents are omitted for anonymous readers');
  await role(OWNER);await db.query('delete from tn_packs where id=$1',[left.pack_id]);await role(OTHER);await db.query('delete from tn_packs where id=$1',[right.pack_id]);
  assert.equal((await evidence(child.version_id)).length,2);assert.deepEqual((await readInfo(child.version_id)).info.origins,[]);
  assert.equal((await merge(originalInput)).version_id,child.version_id,'owned child retry survives deleted parents');
  assert.equal((await value("select tn_read_trust_run($1,'raw') as value",[run.id])).input_hash,run.raw.input_hash);
  await rejects('42501',db.query('insert into tn_template_origins(version_id,parent_version_id,parent_evidence_revision) values($1,$2,1)',[child.version_id,root]));
  await db.query('reset role');console.log('Explicit template merge reconciliation, duplicate evidence, local computation and multi-parent privacy passed');
}
