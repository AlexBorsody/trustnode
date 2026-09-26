"use client";
import { useEffect, useRef, useState } from "react";
import { UUID } from "./model";
import { mergeRows, type MergeInfo, type MergeInput } from "./template-merge";
import { seedDistribution, type SeedMode, type TemplateVersion } from "./templates";
import type { ForkResult } from "./template-fork";
import { requestJson } from "../trust/client";
const unavailable = "Template merging is unavailable right now. Try again later.";
interface Choice { id:string; included:boolean; metadata:string; seed:boolean; rationale:string }
export default function TemplateMerge({version,token}:{version:TemplateVersion;token?:string}) {
  const [open,setOpen]=useState(false),[second,setSecond]=useState("");
  const [pair,setPair]=useState<[MergeInfo,MergeInfo]|null>(null),[choices,setChoices]=useState<Choice[]>([]);
  const [title,setTitle]=useState(""),[metadata,setMetadata]=useState(""),[mode,setMode]=useState<SeedMode|"">("");
  const [copy,setCopy]=useState(false),[agreed,setAgreed]=useState(false),[busy,setBusy]=useState(false);
  const [error,setError]=useState(""),[result,setResult]=useState<ForkResult|null>(null);
  const pending=useRef<MergeInput|null>(null),active=useRef<AbortController|null>(null);
  useEffect(()=>()=>active.current?.abort(),[]);
  async function load(e?:React.FormEvent) {
    e?.preventDefault(); let id=second.trim();
    try { if (!UUID.test(id)) id=new URL(id).searchParams.get("version")??""; } catch { /* Invalid input is reported below. */ }
    if(!UUID.test(id)||id===version.id){setError("Choose a different saved version ID or its direct link.");return;}
    active.current?.abort(); const ctrl=new AbortController(); active.current=ctrl;
    setBusy(true);setError("");setPair(null);pending.current=null;
    try {
      const data=await Promise.all([version.id,id].map(v=>requestJson<MergeInfo>(`/api/templates/${v}/merge`,token,ctrl.signal,undefined,unavailable)));
      if(ctrl.signal.aborted)return;
      if(data[0].version.pack_id===data[1].version.pack_id)throw new Error("Choose a saved version from another pack.");
      setPair(data as [MergeInfo,MergeInfo]);setTitle(`${data[0].version.snapshot.title} + ${data[1].version.snapshot.title}`.slice(0,120));
      setMetadata("");setMode("");setCopy(false);setAgreed(false);
      setChoices(mergeRows(data[0].version,data[1].version).map(r=>({id:r.id,included:true,metadata:r.conflict?"":data[r.left?0:1].version.id,seed:false,rationale:""})));
    }catch(e){if(!ctrl.signal.aborted)setError(e instanceof Error?e.message:"Could not load selected versions.");}
    finally{if(!ctrl.signal.aborted)setBusy(false);}
  }
  function change(id:string,update:Partial<Choice>){setAgreed(false);setChoices(rows=>rows.map(r=>r.id===id?{...r,...update}:r));}
  function move(index:number,delta:number){setAgreed(false);setChoices(rows=>{const next=[...rows];[next[index],next[index+delta]]=[next[index+delta],next[index]];return next;});}
  const selected=choices.filter(c=>c.included),rows=pair?mergeRows(pair[0].version,pair[1].version):[];
  const entries=selected.flatMap((c,index)=>{
    const entry=pair?.find(p=>p.version.id===c.metadata)?.version.snapshot.entries.find(e=>e.source_id===c.id);
    return entry?[{...entry,rank:index+1,is_seed:c.seed,rationale:c.rationale}]:[];
  });
  const preview=mode?seedDistribution(entries,mode):null;
  const copySupported=!!pair&&pair.reduce((n,p)=>n+p.info.evidence_count,0)<=200&&pair.reduce((n,p)=>n+(p.info.evidence_bytes??2097153),0)<=2097152;
  const ready=agreed&&!!mode&&!!metadata&&selected.length>0&&selected.length<=50&&entries.length===selected.length&&entries.some(e=>e.is_seed)
    &&selected.every(c=>!c.seed||!!c.rationale.trim());
  async function save(e:React.FormEvent){
    e.preventDefault();if(!pair||!token||busy||(!pending.current&&!ready))return;
    const ctrl=new AbortController();active.current=ctrl;setBusy(true);setError("");
    pending.current??={parents:pair.map(p=>({version_id:p.version.id,content_hash:p.version.content_hash,evidence_revision:p.info.evidence_revision,visibility_epoch:p.info.visibility_epoch})),
      metadata_version:metadata,title,seed_mode:mode as SeedMode,copy_evidence:copy,request_key:crypto.randomUUID(),
      entries:selected.map(c=>({source_id:c.id,metadata_version:c.metadata,is_seed:c.seed,rationale:c.seed?c.rationale:""}))};
    try{const saved=await requestJson<ForkResult>("/api/templates/merge",token,ctrl.signal,pending.current,unavailable);if(!ctrl.signal.aborted){setResult(saved);pending.current=null;}}
    catch(e){if(!ctrl.signal.aborted)setError(e instanceof Error?e.message:"Could not merge. Your request is retained.");}
    finally{if(!ctrl.signal.aborted)setBusy(false);}
  }
  return <section id="template-merge" aria-label="Merge saved templates" style={{marginTop:20}}>
    {!result&&<button className="chip" disabled={busy} onClick={()=>setOpen(v=>!v)}>{open?"Close merge details":"Merge this saved version"}</button>}
    {open&&!result&&<>
      <p>First version: {version.snapshot.title} · {version.id}. Select a second version, then explicitly reconcile the child’s members and seed policy.</p>
      {!token?<p><a href={`/login?next=${encodeURIComponent(`/packs/${version.pack_id}?version=${version.id}`)}`}>Sign in</a> to own a merged template.</p>:<>
        <form onSubmit={load}><fieldset disabled={busy||!!pending.current} style={{border:0,padding:0}}>
          <label>Second saved version ID or link<input className="claim-input" value={second} onChange={e=>{setSecond(e.target.value);setPair(null);}} required /></label>
          <p>Paste the other template’s “Open this version” link. Loading again discards this reconciliation draft.</p>
          <button className="chip">Load both selected versions</button>
        </fieldset></form>
        {pair&&<form onSubmit={save}>
          <fieldset disabled={busy||!!pending.current} style={{border:0,padding:0,minWidth:0}}>
            <legend>Reconcile the independent child</legend>
            {pair.map((p,i)=><p key={p.version.id}>{i===0?"First":"Second"}: {p.version.snapshot.title} · {p.version.id} · {p.version.snapshot.seed_mode} · {p.info.evidence_count} evidence proposal(s).</p>)}
            <label>Merged title<input className="claim-input" maxLength={120} required value={title} onChange={e=>setTitle(e.target.value)} /></label>
            <label>Category, description and tags<select className="claim-input" required value={metadata} onChange={e=>{setMetadata(e.target.value);setAgreed(false);}}>
              <option value="">Choose a parent’s metadata</option>{pair.map((p,i)=><option key={p.version.id} value={p.version.id}>{i===0?"First":"Second"}: {p.version.snapshot.category} · {p.version.snapshot.description} · {p.version.snapshot.tags.join(", ")}</option>)}
            </select></label>
            <label>Merged seed weighting<select className="claim-input" required value={mode} onChange={e=>{setMode(e.target.value as SeedMode);setAgreed(false);}}>
              <option value="">Choose one seed policy</option><option value="uniform-seeds-v1">Equal weight for each selected seed</option><option value="ordered-seeds-v1">Weight by selected seeds’ order</option>
            </select></label>
            <p>Choose seeds below and explain them. Parent seed weights are never added. Ordered seeds receive 1, 1/2, 1/3… before normalization; member order defines seed order.</p>
            <p>{selected.length}/50 members selected. Conflicting metadata requires a parent choice. Shared sources appear once.</p>
            {choices.map((c,index)=>{const row=rows.find(r=>r.id===c.id)!;const chosen=entries.find(e=>e.source_id===c.id);return <fieldset key={c.id} style={{marginBottom:16}}>
              <legend>{index+1}. {row.left?.title??row.right?.title}</legend>
              <label><input type="checkbox" checked={c.included} onChange={e=>change(c.id,{included:e.target.checked})}/> Include member</label>
              {[row.left,row.right].map((e,i)=>e&&<div key={i}>
                <p>{i===0?"First":"Second"}: {e.title} · {e.url} · {e.site_host??"No site"} · {e.status} · rank {e.rank}</p>
                <p>Note: {e.note||"None"}. {e.is_seed?`Seed: ${e.rationale}`:"Not a seed"}</p>
                <label><input type="radio" name={`merge-meta-${c.id}`} disabled={!c.included} checked={c.metadata===pair[i].version.id} onChange={()=>change(c.id,{metadata:pair[i].version.id,seed:false,rationale:""})}/> Use {i===0?"first":"second"} captured metadata</label>
              </div>)}
              {c.included&&!c.metadata&&<p>Choose which captured metadata to keep.</p>}
              <label><input type="checkbox" checked={c.seed} disabled={!c.included||!chosen?.site_id||chosen.status!=="ready"} onChange={e=>change(c.id,{seed:e.target.checked,rationale:""})}/> Use as a seed in the child</label>
              {c.included&&c.seed&&<label>Child seed rationale<textarea className="claim-input" required maxLength={1000} value={c.rationale} onChange={e=>change(c.id,{rationale:e.target.value})}/></label>}
              <button type="button" className="chip" disabled={index===0} onClick={()=>move(index,-1)}>Move up</button>{" "}
              <button type="button" className="chip" disabled={index===choices.length-1} onClick={()=>move(index,1)}>Move down</button>
            </fieldset>;})}
            {preview&&<p>Starting site distribution: {preview.sites.map(s=>`${s.host} ${(s.mass*100).toFixed(1)}%`).join(" · ")||"Choose seeds"}</p>}
            <label><input type="checkbox" checked={copy} disabled={!copySupported} onChange={e=>{setCopy(e.target.checked);setAgreed(false);}}/> Copy current evidence from both parents as proposals</label>
            <p>Only evidence with both endpoints included is copied. Identical evidence is stored once with its visible origins. Every proposal needs your own review; parent decisions never transfer. Combined evidence is limited to 200 records and 2 MiB.</p>
            {!copySupported&&<p>These parents exceed evidence copy limits. You can still merge the members and seeds.</p>}
            <p>The child starts private and remains independent when either parent changes, hides or is deleted. Parent attribution follows current access.</p>
            <label><input type="checkbox" checked={agreed} onChange={e=>setAgreed(e.target.checked)}/> I reviewed the selected metadata, member order, seeds, rationale and weighting.</label>
          </fieldset>
          <button className="btn" disabled={busy||(!pending.current&&!ready)}>{busy?"Creating merged template…":pending.current?"Retry same merge request":"Create independent merged template"}</button>
          {pending.current&&<button type="button" className="chip" disabled={busy} onClick={()=>{pending.current=null;void load();}}>Discard request and reload parents</button>}
        </form>}
      </>}
      {busy&&!pair&&<p role="status">Loading selected versions…</p>}{error&&<p role="alert">{error}</p>}
    </>}
    {result&&<div role="status"><p>Independent merged template created with {result.copied_evidence} imported proposal(s). Review them locally before computing propagated trust.</p>
      <a className="chip" href={`/packs/${result.pack_id}?version=${result.version_id}`}>Open merge and review evidence</a>{" "}
      <a className="chip" href={`/trust?pack=${result.pack_id}&version=${result.version_id}`}>Compute merged trust</a></div>}
  </section>;
}
