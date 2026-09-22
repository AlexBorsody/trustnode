"use client";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/useAuth";
import type { TemplateVersion } from "../packs/templates";
import { UUID } from "../packs/model";
import { inTopic, topicOptions } from "../packs/browse";
import { requestJson } from "./client";
import RunPanel from "./RunPanel";
interface Pack { id: string; title: string; category: string; is_public: boolean; owner_id: string }
interface RunRow { id: string; state: string; created_at: string }
interface Tokens { id: string; evidence_revision: number; tn_packs: { id: string; revision: number } }
interface InitialSelection { pack?: string; version?: string; run?: string }
const errorText = (error: unknown) => error instanceof Error ? error.message : "Could not load trust data.";

export default function TrustWorkspace({ initial }: { initial: InitialSelection }) {
  const { session, ready, error } = useAuth();
  if (!ready) return <p role="status">Restoring account access…</p>;
  return <><h1 className="page-title">Trust workspace</h1>
    <p className="page-sub">Inspect site and resource authority under a category’s declared seeds and evidence. Graph authority, research relevance and factual confidence are separate signals.</p>
    {error && <p role="alert">{error}</p>}
    <Workspace key={`${session?.user.id ?? "anonymous"}:${session?.access_token ?? ""}`} token={session?.access_token} userId={session?.user.id} initial={initial} />
  </>;
}
function Workspace({ token, userId, initial }: { token?: string; userId?: string; initial: InitialSelection }) {
  const [packs, setPacks] = useState<Pack[]>([]), [category, setCategory] = useState("");
  const [packId, setPackId] = useState(initial.pack ?? ""), [runId, setRunId] = useState(initial.run ?? "");
  const [error, setError] = useState(""), [refresh, setRefresh] = useState(0), [busy, setBusy] = useState(true);
  const [direct, setDirect] = useState(initial.run ?? "");
  useEffect(() => {
    const ctrl = new AbortController(); setPacks([]); setBusy(true); setError("");
    requestJson<{ packs: Pack[] }>("/api/packs", token, ctrl.signal).then(data => { if (!ctrl.signal.aborted) setPacks(data.packs); })
      .catch(e => { if (!ctrl.signal.aborted) setError(errorText(e)); }).finally(() => { if (!ctrl.signal.aborted) setBusy(false); });
    return () => ctrl.abort();
  }, [token, refresh]);
  function openRun(id: string) {
    setRunId(id); setDirect(id);
    const url = new URL(window.location.href); url.searchParams.delete("pack"); url.searchParams.delete("version"); if (id) url.searchParams.set("run", id); else url.searchParams.delete("run");
    window.history.replaceState(null, "", url.pathname + url.search);
  }
  const visible = packs.filter(p => inTopic(p.category, category));
  return <>
    <section className="panel" aria-label="Choose a trust template">
      <h2>Category and template</h2>
      <div className="trust-controls">
        <label>Category<select className="claim-input" value={category} onChange={e => { setCategory(e.target.value); setPackId(""); openRun(""); }}>
          <option value="">All categories</option>{topicOptions(packs).map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select></label>
        <label>Source pack<select className="claim-input" value={packId} onChange={e => { setPackId(e.target.value); openRun(""); }}>
          <option value="">Choose a pack</option>{packId && !visible.some(p => p.id === packId) && <option value={packId}>Linked pack</option>}
          {visible.map(p => <option key={p.id} value={p.id}>{p.title}{p.is_public ? "" : " · Private"}</option>)}
        </select></label>
      </div>
      <p className="panel-sub">Browsing the newest 50 accessible packs. Create seeds and recorded evidence in <a href="/packs">Source packs</a>.</p>
      {busy && <p role="status">Loading packs…</p>}{error && <p role="alert">{error}</p>}
      {!busy && !error && !packs.length && <p>No accessible packs yet. <a href="/packs">Create a source pack</a> to begin.</p>}
      <button className="chip" disabled={busy} onClick={() => { setPackId(""); openRun(""); setRefresh(n => n + 1); }}>Refresh pack list</button>
      {!token && <p><a href="/login?next=%2Ftrust">Sign in</a> to request or publish runs. Published runs are readable without an account.</p>}
    </section>
    {packId && <TemplatePicker key={packId} packId={packId} token={token} initialVersion={packId === initial.pack ? initial.version : undefined} onRun={openRun} />}
    <form className="panel" onSubmit={e => { e.preventDefault(); if (UUID.test(direct)) openRun(direct.toLowerCase()); }}>
      <label>Open a run by ID<input className="claim-input" required pattern="[a-fA-F0-9-]{36}" value={direct} onChange={e => setDirect(e.target.value)} placeholder="Run UUID" /></label>
      <button className="chip" style={{ marginTop: 10 }}>Open run</button>
    </form>
    {runId && <RunPanel key={runId} runId={runId} token={token} userId={userId} />}
  </>;
}
function TemplatePicker({ packId, token, initialVersion, onRun }: { packId: string; token?: string; initialVersion?: string; onRun(id: string): void }) {
  const [versions, setVersions] = useState<TemplateVersion[]>([]), [selected, setSelected] = useState("");
  const [error, setError] = useState(""), [busy, setBusy] = useState(true), [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const ctrl = new AbortController(); setVersions([]); setSelected(""); setError(""); setBusy(true);
    requestJson<{ versions: TemplateVersion[] }>(`/api/packs/${packId}/versions${initialVersion && !refresh ? `?version=${initialVersion}` : ""}`, token, ctrl.signal)
      .then(data => { if (!ctrl.signal.aborted) { setVersions(data.versions); setSelected(data.versions[0]?.id ?? ""); } })
      .catch(e => { if (!ctrl.signal.aborted) setError(errorText(e)); }).finally(() => { if (!ctrl.signal.aborted) setBusy(false); });
    return () => ctrl.abort();
  }, [packId, token, initialVersion, refresh]);
  return <section className="panel" aria-label="Saved trust template">
    <h2>Saved template</h2>{busy && <p role="status">Loading saved versions…</p>}{error && <p role="alert">{error}</p>}
    {!!versions.length && <label>Template version<select className="claim-input" value={selected} onChange={e => { setSelected(e.target.value); onRun(""); }}>
      {versions.map(v => <option key={v.id} value={v.id}>{v.snapshot.title} · pack revision {v.pack_revision} · {v.id.slice(0, 8)}</option>)}
    </select></label>}
    {!busy && !error && !versions.length && <p>This pack has no captured seeds yet. <a href={`/packs/${packId}`}>Save a template version</a>.</p>}
    <button className="chip" disabled={busy} onClick={() => { onRun(""); setRefresh(n => n + 1); }}>Load recent versions</button>
    {selected && <TemplateRuns key={selected} versionId={selected} token={token} onRun={onRun} />}
  </section>;
}
function TemplateRuns({ versionId, token, onRun }: { versionId: string; token?: string; onRun(id: string): void }) {
  const [tokens, setTokens] = useState<Tokens | null>(null), [runs, setRuns] = useState<RunRow[]>([]);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [refresh, setRefresh] = useState(0), [offset, setOffset] = useState(0);
  const mutation = useRef<AbortController | null>(null), pendingRequest = useRef<{ template_version_id: string; pack_revision: number; evidence_revision: number; request_key: string } | null>(null);
  useEffect(() => {
    const ctrl = new AbortController(); setTokens(null); setError(""); setRuns([]);
    Promise.all([requestJson<Tokens>(`/api/trust/inputs?template_version=${versionId}`, token, ctrl.signal),
      requestJson<{ runs: RunRow[] }>(`/api/trust/runs?template_version=${versionId}&offset=${offset}`, token, ctrl.signal)])
      .then(([t, r]) => { if (!ctrl.signal.aborted) { setTokens(t); setRuns(r.runs); } }).catch(e => { if (!ctrl.signal.aborted) setError(errorText(e)); });
    return () => ctrl.abort();
  }, [versionId, token, refresh, offset]);
  useEffect(() => () => mutation.current?.abort(), []);
  async function enqueue() {
    if (!tokens || !token || busy) return;
    const ctrl = new AbortController(); mutation.current = ctrl; setBusy(true); setError("");
    pendingRequest.current ??= { template_version_id: versionId, pack_revision: tokens.tn_packs.revision,
      evidence_revision: tokens.evidence_revision, request_key: crypto.randomUUID() };
    try {
      const result = await requestJson<{ run_id: string }>("/api/trust/runs", token, ctrl.signal, pendingRequest.current);
      if (!ctrl.signal.aborted) { pendingRequest.current = null; onRun(result.run_id); setRefresh(n => n + 1); }
    } catch (e) { if (!ctrl.signal.aborted) setError(errorText(e)); }
    finally { if (!ctrl.signal.aborted) setBusy(false); }
  }
  return <div style={{ marginTop: 16 }}>
    {tokens && <p className="panel-sub">Captured controls: pack revision {pendingRequest.current?.pack_revision ?? tokens.tn_packs.revision}, evidence revision {pendingRequest.current?.evidence_revision ?? tokens.evidence_revision}. The computation freezes these inputs.</p>}
    <button className="btn" disabled={!token || !tokens || busy} onClick={enqueue}>{busy ? "Requesting run…" : "Compute trust"}</button>{" "}
    <button className="chip" disabled={busy} onClick={() => { pendingRequest.current = null; setRefresh(n => n + 1); }}>Reload inputs and runs</button>
    {error && <p role="alert">{error}</p>}
    <p className="panel-sub">Up to two active runs and ten new runs per hour. A failed request retains its request key for a safe retry.</p>
    <h3>Available runs</h3>
    {!runs.length && tokens && <p>No runs on this page. Your unpublished runs and accessible published runs appear here.</p>}
    <ul>{runs.map(run => <li key={run.id}><button className="chip" onClick={() => onRun(run.id)}>{run.state} · {run.id.slice(0, 8)} · {new Date(run.created_at).toLocaleString()}</button></li>)}</ul>
    <button className="chip" disabled={busy || offset === 0} onClick={() => setOffset(n => n - 20)}>Previous runs</button>{" "}
    <button className="chip" disabled={busy || runs.length < 20 || offset >= 10000} onClick={() => setOffset(n => n + 20)}>More runs</button>
  </div>;
}
