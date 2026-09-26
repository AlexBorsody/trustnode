"use client";
import { useEffect, useRef, useState } from "react";
import type { TemplateVersion } from "@/packs/templates";
import { relations, type EvidenceBody, type EvidenceRevision, type EvidenceReview, type Relationship } from "./relationships";

type Api = (path: string, body?: unknown) => Promise<unknown>;
type History = { revisions: EvidenceRevision[]; reviews: EvidenceReview[]; next_revision: number | null; next_review: number | null };
const blank = (version: TemplateVersion): EvidenceBody => {
  const today = new Date();
  const observed_on = [today.getFullYear(), String(today.getMonth()+1).padStart(2,"0"), String(today.getDate()).padStart(2,"0")].join("-");
  return { source_id: version.snapshot.entries[0]?.source_id ?? "",
  target_id: version.snapshot.entries[1]?.source_id ?? "", relation: "cites", rationale: "", claim_scope: "",
  source_locator: "", source_quote: "", target_locator: "", target_quote: "", observed_on };
};

export default function EvidencePanel({ version, token, userId, isOwner }: {
  version: TemplateVersion; token?: string; userId?: string; isOwner: boolean;
}) {
  const [rows, setRows] = useState<Relationship[] | null>(null), [offset, setOffset] = useState(0), [reload, setReload] = useState(0);
  const [body, setBody] = useState(() => blank(version)), [editing, setEditing] = useState<Relationship | null>(null);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false), [conflict, setConflict] = useState(false);
  const lifetime = useRef<AbortController | null>(null);
  useEffect(() => { const ctrl = new AbortController(); lifetime.current = ctrl; return () => ctrl.abort(); }, []);
  const api: Api = async (path, data) => {
    const response = await fetch(path, { method: data === undefined ? "GET" : "POST", cache: "no-store", signal: lifetime.current?.signal,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result.error ?? "Could not load evidence."), { status: response.status });
    return result;
  };
  useEffect(() => {
    const ctrl = new AbortController(); setRows(null); setError("");
    fetch(`/api/relationships?template_version=${version.id}&offset=${offset}`, { cache: "no-store", signal: ctrl.signal,
      headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.error); return data; })
      .then(data => { if (!ctrl.signal.aborted) setRows(data.relationships); })
      .catch(e => { if (!ctrl.signal.aborted) setError(e.message); });
    return () => ctrl.abort();
  }, [version.id, token, offset, reload]);
  const refresh = () => { setNotice(""); setReload(n => n + 1); };
  const reset = () => { setEditing(null); setBody(blank(version)); setConflict(false); setError(""); };
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      await api("/api/relationships", { template_version_id: version.id, evidence: body,
        edge_id: editing?.id ?? null, previous_revision_id: editing?.current_revision.id ?? null });
      reset(); refresh(); setNotice("Evidence saved as a proposal. The curator must review this revision before using it.");
    } catch (e) { if (!lifetime.current?.signal.aborted) { setError(e instanceof Error ? e.message : "Could not save evidence."); if ((e as {status?:number}).status === 409) setConflict(true); } }
    finally { if (!lifetime.current?.signal.aborted) setBusy(false); }
  }
  return <section aria-label="Template evidence" style={{ marginTop: 24 }}>
    <h3>Evidence relationships</h3>
    <p className="panel-sub">Record how these sources cite, support, dispute or replace one another. Proposals and curator decisions are separate. Acceptance applies only to this saved template; compute its graph authority in the trust workspace.</p>
    {notice && <p role="status">{notice}</p>}{error && <p role="alert">{error}</p>}
    {error && <button className="chip" onClick={refresh} disabled={busy}>Retry reading evidence</button>}
    {token && version.snapshot.entries.length > 1 && <form onSubmit={save}>
      <h4>{editing ? `Revise proposal ${editing.current_revision.revision}` : "Propose a relationship"}</h4>
      <fieldset disabled={busy || conflict} style={{ border: 0, padding: 0, minWidth: 0 }}>
        {([['source_id','From source'],['target_id','To source']] as const).map(([key,label]) => <label key={key}>{label}<select className="claim-input" value={body[key]} onChange={e => setBody(b => ({ ...b, [key]: e.target.value }))}>
          {version.snapshot.entries.map(entry => <option key={entry.source_id} value={entry.source_id}>{entry.title}</option>)}
        </select></label>)}
        <label>Relationship<select className="claim-input" value={body.relation} onChange={e => setBody(b => ({ ...b, relation: e.target.value as EvidenceBody['relation'] }))}>{relations.map(r => <option key={r}>{r}</option>)}</select></label>
        <label>Observed on<input className="claim-input" type="date" required value={body.observed_on} onChange={e => setBody(b => ({ ...b, observed_on: e.target.value }))} /></label>
        {([['claim_scope','Specific claim or scope',1000],['source_locator','Where in the first source?',1000],['source_quote','Quotation from the first source',2000],['target_locator','Where in the second source?',1000],['target_quote','Quotation from the second source',2000],['rationale','Why does this evidence establish the relationship?',2000]] as const).map(([key,label,max]) => <label key={key}>{label}<textarea className="claim-input" maxLength={max} value={body[key]}
          required={key==='rationale' || key==='source_locator' || (body.relation!=='cites' && (key==='claim_scope' || key==='target_locator'))} onChange={e => setBody(b => ({ ...b, [key]: e.target.value }))} /></label>)}
        <p className="panel-sub">Use a section, page or passage locator. Quotations are submitted evidence, not independently verified captures. Acceptance requires the curator to review the quoted evidence; conflicts and supersession never become negative authority edges.</p>
        <button className="btn">{busy ? "Saving…" : editing ? "Save new revision" : "Save proposal"}</button>
      </fieldset>
      {(editing || conflict) && <button type="button" className="chip" disabled={busy} onClick={() => { reset(); refresh(); }}>Discard draft and reload</button>}
    </form>}
    {!token && <p>Sign in to propose or challenge evidence.</p>}
    {version.snapshot.entries.length < 2 && <p>A relationship needs two members in the saved template.</p>}
    {rows === null && !error && <p role="status">Loading evidence…</p>}
    {rows?.length === 0 && <p>No relationships on this page.</p>}
    {rows?.map(row => <EvidenceCard key={row.id} row={row} version={version} api={api} signedIn={!!token} isOwner={isOwner} refresh={refresh}
      revise={row.author_id === userId && !editing && !busy ? () => { setEditing(row); setBody(row.current_revision.body); setError(""); setConflict(false); } : undefined} />)}
    <p><button className="chip" disabled={offset===0 || rows===null || busy} onClick={() => setOffset(n => Math.max(0,n-20))}>Previous evidence</button>{" "}<button className="chip" disabled={rows?.length!==20 || offset>=10000 || busy} onClick={() => setOffset(n => n+20)}>Next evidence</button></p>
  </section>;
}

function EvidenceCard({ row, version, api, signedIn, isOwner, refresh, revise }: {
  row: Relationship; version: TemplateVersion; api: Api; signedIn: boolean; isOwner: boolean; refresh: () => void; revise?: () => void;
}) {
  const [history,setHistory] = useState<History | null>(null), [error,setError] = useState(""), [busy,setBusy] = useState(false);
  const [action,setAction] = useState(isOwner ? "accept" : "challenge"), [reason,setReason] = useState(""), [locator,setLocator] = useState(""), [excerpt,setExcerpt] = useState("");
  const [reviewed,setReviewed] = useState(false), [challenge,setChallenge] = useState<number | null>(null);
  const current = row.current_revision, b = current.body;
  const title = (id: string) => version.snapshot.entries.find(e => e.source_id===id)?.title ?? "Source";
  async function loadHistory() {
    setBusy(true); setError("");
    try {
      const next = await api(`/api/relationships/${row.id}${history ? `?before_revision=${history.next_revision ?? 1}&before_review=${history.next_review ?? 1}` : ''}`) as History;
      setHistory(h => ({ ...next, revisions: [...(h?.revisions ?? []),...next.revisions], reviews: [...(h?.reviews ?? []),...next.reviews] }));
    } catch(e) { setError(e instanceof Error ? e.message : "Could not load history."); } finally { setBusy(false); }
  }
  async function review(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    const revision = challenge ? history?.reviews.find(r => r.id===challenge)?.revision_id : current.id;
    try {
      await api(`/api/relationships/revisions/${revision}/reviews`, { action, reason, locator, excerpt, evidence_reviewed: reviewed,
        expected_decision_id: row.current_decision?.id ?? null, challenge_id: challenge });
      refresh();
    } catch(e) { setError(e instanceof Error ? e.message : "Could not save review."); } finally { setBusy(false); }
  }
  return <article style={{ marginTop: 24 }}>
    <h4>{title(b.source_id)} → {title(b.target_id)}</h4>
    <p>{b.relation} · revision {current.revision} · {row.current_decision?.action ?? "proposed"} · observed {b.observed_on}</p>
    <p className="panel-sub">{row.creation_kind === "template-import" ? "Imported evidence · local importer" : "Contributor"}: {row.author_id ?? "deleted account"}</p>
    {(row.origins ?? (row.origin ? [row.origin] : [])).map(origin => <p key={origin.revision_id}>Imported starting revision from <a href={`/packs/${origin.pack_id}?version=${origin.version_id}`}>{origin.title}</a>
      {" "}· {origin.revision_id} · parent {origin.creation_kind === "template-import" ? "importer" : "contributor"}: {origin.author_id ?? "deleted account"}. Parent decisions do not apply here.</p>)}
    {b.claim_scope && <p>Scope: {b.claim_scope}</p>}<p>{b.rationale}</p>
    <p>First source: {b.source_locator}</p>{b.source_quote && <blockquote>{b.source_quote}</blockquote>}
    {b.target_locator && <p>Second source: {b.target_locator}</p>}{b.target_quote && <blockquote>{b.target_quote}</blockquote>}
    {row.current_decision && <p>Curator decision: {row.current_decision.reason}</p>}
    {revise && <button className="chip" onClick={revise}>Revise my proposal</button>}{" "}
    <button className="chip" disabled={busy || (!!history && !history.next_revision && !history.next_review)} onClick={loadHistory}>{history ? "Load older history" : "Read revision and review history"}</button>
    {error && <><p role="alert">{error}</p><button className="chip" disabled={busy} onClick={refresh}>Discard review draft and reload</button></>}
    {history && <details open><summary>Evidence history</summary>
      {history.revisions.map(r => <details key={r.id}><summary>Revision {r.revision} · {r.body.relation} · {r.created_at}</summary><p>{r.body.rationale}</p><p>{r.body.claim_scope}</p><p>{r.body.source_locator}: {r.body.source_quote}</p><p>{r.body.target_locator}: {r.body.target_quote}</p></details>)}
      {history.reviews.map(r => <div key={r.id}><p>{r.action} · {r.author_id ?? "deleted account"} · {r.created_at}: {r.reason}</p>{r.locator && <p>{r.locator}: {r.excerpt}</p>}
        {isOwner && r.action==='challenge' && !history.reviews.some(x => x.challenge_id===r.id) && <button className="chip" onClick={() => { setChallenge(r.id); setAction('uphold'); setReason(''); }}>Resolve this challenge</button>}
      </div>)}
    </details>}
    {signedIn && <form onSubmit={review}><fieldset disabled={busy} style={{ border: 0, padding: 0, minWidth: 0 }}>
      <legend>{challenge ? "Resolve selected challenge" : "Review or challenge this revision"}</legend>
      <label>Action<select className="claim-input" value={action} onChange={e => setAction(e.target.value)}>
        {(challenge ? ['uphold','dismiss'] : isOwner ? ['accept','reject','withdraw','challenge'] : ['challenge']).map(a => <option key={a}>{a}</option>)}
      </select></label>
      <label>Reason<textarea className="claim-input" required maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} /></label>
      {action==='accept' && <label><input type="checkbox" required checked={reviewed} onChange={e => setReviewed(e.target.checked)} /> I reviewed the quotations and locators for this relationship.</label>}
      {action==='challenge' && <><label>Evidence locator<input className="claim-input" required maxLength={1000} value={locator} onChange={e => setLocator(e.target.value)} /></label><label>Evidence quotation<textarea className="claim-input" required maxLength={2000} value={excerpt} onChange={e => setExcerpt(e.target.value)} /></label></>}
      <p className="panel-sub">Challenges and their resolutions remain visible. Resolving a challenge does not change acceptance; the curator records that decision separately.</p>
      <button className="chip">Save review</button>{challenge && <button type="button" className="chip" onClick={() => { setChallenge(null); setAction('accept'); }}>Cancel resolution</button>}
    </fieldset></form>}
  </article>;
}
