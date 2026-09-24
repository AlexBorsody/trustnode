"use client";
import { useEffect, useRef, useState } from "react";
import type { TemplateVersion } from "./templates";
import type { ForkInfo, ForkInput, ForkResult } from "./template-fork";
import { requestJson } from "../trust/client";
const unavailable = "Template forking is unavailable right now. Try again later.";
export default function TemplateFork({ version, token }: { version: TemplateVersion; token?: string }) {
  const [info, setInfo] = useState<ForkInfo | null>(null), [open, setOpen] = useState(false), [reload, setReload] = useState(0);
  const [copy, setCopy] = useState(false), [title, setTitle] = useState(`${version.snapshot.title.slice(0, 110)} (fork)`);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [result, setResult] = useState<ForkResult | null>(null);
  const pending = useRef<ForkInput | null>(null), action = useRef<AbortController | null>(null);
  const url = `/api/templates/${version.id}/fork`;
  useEffect(() => {
    const ctrl = new AbortController(); setInfo(null); setError("");
    requestJson<ForkInfo>(url, token, ctrl.signal, undefined, unavailable).then(data => { if (!ctrl.signal.aborted) setInfo(data); })
      .catch(e => { if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : "Could not load fork summary."); });
    return () => ctrl.abort();
  }, [url, token, reload]);
  useEffect(() => () => action.current?.abort(), []);
  async function fork(e: React.FormEvent) {
    e.preventDefault(); if (!info || !token || busy) return;
    const ctrl = new AbortController(); action.current = ctrl; setBusy(true); setError("");
    pending.current ??= { content_hash: version.content_hash, evidence_revision: info.evidence_revision,
      visibility_epoch: info.visibility_epoch, copy_evidence: copy, title, request_key: crypto.randomUUID() };
    try {
      const saved = await requestJson<ForkResult>(url, token, ctrl.signal, pending.current, unavailable);
      if (!ctrl.signal.aborted) { setResult(saved); pending.current = null; }
    } catch (e) { if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : "Could not fork this version."); }
    finally { if (!ctrl.signal.aborted) setBusy(false); }
  }
  return <section aria-label="Fork saved template" style={{ marginTop: 20 }}>
    {info?.origin && <p>Starting version: <a href={`/packs/${info.origin.pack_id}?version=${info.origin.version_id}`}>{info.origin.title} · {info.origin.version_id.slice(0, 8)}</a>
      {" "}· pack revision {info.origin.pack_revision} · evidence revision {info.origin.evidence_revision}. Your copy is independent.</p>}
    {!result && <button className="chip" disabled={busy} onClick={() => setOpen(v => !v)}>{open ? "Close fork details" : "Fork this saved version"}</button>}
    {open && !result && <>
      <p>Fork version {version.id}. Your new pack starts private and preserves these {version.snapshot.entries.length} members, their order, seed weighting and rationale.</p>
      {info && <p>{info.evidence_count} current evidence proposal(s), including {info.accepted_count} accepted in the parent. Copied evidence starts unaccepted. No reviews or decisions are copied.</p>}
      {!info && !error && <p role="status">Loading fork summary…</p>}
      {!token && <p><a href={`/login?next=${encodeURIComponent(`/packs/${version.pack_id}?version=${version.id}`)}`}>Sign in</a> to own an independent fork.</p>}
      {token && <form onSubmit={fork}>
        <fieldset disabled={busy || !!pending.current || !info} style={{ border: 0, padding: 0 }}>
          <label>Fork title<input className="claim-input" required maxLength={120} value={title} onChange={e => setTitle(e.target.value)} /></label>
          <label>Evidence to copy<select className="claim-input" value={copy ? "proposals" : "none"} onChange={e => setCopy(e.target.value === "proposals")}>
            <option value="none">Seeds and members only</option><option value="proposals" disabled={!info?.copy_supported}>Copy current evidence as proposals</option>
          </select></label>
        </fieldset>
        <p className="panel-sub">{copy ? "You will review imported proposals locally before they propagate trust." : "This fork will begin with seed preferences only; add evidence locally."} Copied content remains in your fork if the parent is hidden or deleted. Attribution links follow the parent’s current visibility.</p>
        {info && !info.copy_supported && <p>Evidence copy is limited to {info.copy_limit} proposals and 2 MiB. Seeds can still be forked.</p>}
        <button className="btn" disabled={busy || !info}>{busy ? "Creating independent fork…" : pending.current ? "Retry same fork request" : "Create independent fork"}</button>
      </form>}
      {error && <p role="alert">{error}</p>}
      <button className="chip" disabled={busy} onClick={() => { pending.current = null; setReload(n => n + 1); }}>Discard request and reload fork summary</button>
    </>}
    {result && <div role="status"><p>Independent fork created with {result.copied_evidence} imported proposal(s). Each requires your own review.</p>
      <a className="chip" href={`/packs/${result.pack_id}?version=${result.version_id}`}>Open fork and review evidence</a>{" "}
      <a className="chip" href={`/trust?pack=${result.pack_id}&version=${result.version_id}`}>Compute this fork’s trust</a></div>}
  </section>;
}
