"use client";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/useAuth";
import { requestJson } from "../trust/client";
import { safeSourceUrl } from "../trust/model";
import type { DiscoveryPage, DiscoveryTemplate } from "./template-discovery";
import { UUID } from "./model";
import TemplateReference from "./TemplateReference";

export default function TemplateDiscovery({ initialCategory }: { initialCategory: string }) {
  const { session, ready, error } = useAuth();
  if (!ready) return <p role="status">Restoring account access…</p>;
  return <>
    <h1 className="page-title">Category templates</h1>
    <p className="page-sub">Discover saved seed policies, inspect their evidence, and fork or merge an independent version. Template curation and public adoption are separate from <a href="/trust">site and resource trust rankings</a>.</p>
    {error && <p role="alert">{error}</p>}
    <DiscoveryModes key={`${session?.user.id ?? "anonymous"}:${session?.access_token ?? ""}`} token={session?.access_token} initialCategory={initialCategory} />
  </>;
}
function DiscoveryModes({ token, initialCategory }: { token?: string; initialCategory: string }) {
  const [category, setCategory] = useState(initialCategory), [draft, setDraft] = useState("");
  const [reference, setReference] = useState(""), [error, setError] = useState("");
  return <>
    <form className="panel" onSubmit={e => {
      e.preventDefault(); let id = draft.trim();
      try { if (!UUID.test(id)) id = new URL(id).searchParams.get("run") ?? ""; } catch { /* Report invalid selection below. */ }
      if (!UUID.test(id)) { setError("Paste a completed run ID or its trust-workspace link."); return; }
      setError(""); setReference(id.toLowerCase());
    }}>
      <label>Optional reference run ID or link<input className="claim-input" value={draft} onChange={e => setDraft(e.target.value)} /></label>
      <p>Choose an accessible completed run explicitly. Comparison uses the current category: {category || "All categories"}. No reference is selected automatically or designated canonical.</p>
      <button className="chip">Compare using this reference</button>{" "}
      {reference && <button className="chip" type="button" onClick={() => { setReference(""); setDraft(""); setError(""); }}>Return to chronological discovery</button>}
      {error && <p role="alert">{error}</p>}
    </form>
    {reference ? <TemplateReference key={`${reference}:${category}`} run={reference} category={category} token={token} />
      : <Discovery token={token} initialCategory={category} onCategory={setCategory} />}
  </>;
}
function Discovery({ token, initialCategory, onCategory }: { token?: string; initialCategory: string; onCategory(category: string): void }) {
  const [draft, setDraft] = useState(initialCategory), [category, setCategory] = useState(initialCategory);
  const [cursors, setCursors] = useState<(string | null)[]>([null]), [page, setPage] = useState(0);
  const [data, setData] = useState<DiscoveryPage | null>(null), [error, setError] = useState("");
  const [busy, setBusy] = useState(true), [refresh, setRefresh] = useState(0);
  const active = useRef<AbortController | null>(null), cursor = cursors[page];
  function clear() { active.current?.abort(); setData(null); setError(""); setBusy(true); }
  function restart() { clear(); setCursors([null]); setPage(0); setRefresh(n => n + 1); }
  useEffect(() => {
    const ctrl = new AbortController(); active.current = ctrl; setData(null); setError(""); setBusy(true);
    const query = new URLSearchParams(); if (category) query.set("category", category); if (cursor) query.set("cursor", cursor);
    requestJson<DiscoveryPage>(`/api/templates?${query}`, token, ctrl.signal, undefined, "Saved-template discovery is unavailable. Try again when storage is ready.")
      .then(result => { if (!ctrl.signal.aborted) setData(result); })
      .catch(e => { if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : "Could not load templates."); })
      .finally(() => { if (!ctrl.signal.aborted) setBusy(false); });
    const focus = () => { if (document.visibilityState === "visible") restart(); };
    window.addEventListener("focus", focus); document.addEventListener("visibilitychange", focus);
    return () => { ctrl.abort(); window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", focus); };
  }, [category, cursor, token, refresh]);
  return <>
    <form className="panel" onSubmit={e => {
      e.preventDefault(); restart(); setCategory(draft.trim()); onCategory(draft.trim());
      const query = new URLSearchParams(); if (draft.trim()) query.set("category", draft.trim());
      window.history.replaceState(null, "", `/templates${query.size ? `?${query}` : ""}`);
    }}>
      <label>Category path<input className="claim-input" maxLength={80} value={draft} onChange={e => setDraft(e.target.value)} placeholder="Security > OAuth" /></label>
      <p className="panel-sub">Includes descendant categories. Leave blank for all accessible saved versions. Matching paths remain attributed to their individual curators.</p>
      <button className="btn" disabled={busy}>Browse category</button>{" "}
      <button type="button" className="chip" disabled={busy} onClick={restart}>Refresh templates</button>
    </form>
    <p>Newest saved versions first, with stable version-ID ties. Each card is an immutable version; current pack visibility controls access.</p>
    <p className="panel-sub">Public adoption is shown per resource using the newest {data?.adoption_scope.public_pack_limit ?? 200} public packs{data ? ` (${data.adoption_scope.public_packs_considered} considered)` : ""}. Each curator contributes their best 1 / pack rank, at most 1; the total is capped at 2. Private packs never contribute. This is preference, not factual accuracy or graph authority.</p>
    {busy && <p role="status">Loading saved templates…</p>}
    {error && <p role="alert">{error} <button className="chip" onClick={restart}>Restart discovery</button></p>}
    {data && !data.templates.length && <p>No accessible saved templates in this category on this page. <a href="/packs">Create a pack and save its seeds</a>.</p>}
    {data?.templates.map(template => <TemplateCard key={template.id} template={template} />)}
    <nav aria-label="Template pages" style={{ marginTop: 20 }}>
      <button className="chip" disabled={busy || page === 0} onClick={() => { clear(); setPage(n => n - 1); }}>Previous templates</button>{" "}
      <button className="chip" disabled={busy || !data?.next_cursor} onClick={() => {
        if (!data?.next_cursor) return;
        clear(); setCursors(old => [...old.slice(0, page + 1), data.next_cursor]); setPage(n => n + 1);
      }}>More templates</button>
      <span> Page {page + 1}</span>
    </nav>
  </>;
}
function TemplateCard({ template: t }: { template: DiscoveryTemplate }) {
  const url = `/packs/${t.pack_id}?version=${t.id}`, trust = `/trust?pack=${t.pack_id}&version=${t.id}`;
  const seeds = t.members.filter(m => m.is_seed), sites = new Set(t.members.map(m => m.site_id).filter(Boolean));
  const mapped = t.members.filter(m => m.site_id).length;
  return <article className="panel" aria-label={t.title}>
    <h2><a href={url}>{t.title}</a></h2>
    <p>{t.description}</p>
    <p>{t.is_public ? "Public" : "Private"} · Author: {t.owner_id ?? "Unattributed"} · Category: {t.category}</p>
    <p className="panel-sub">Saved pack revision {t.pack_revision} · Version {t.id} · {new Date(t.created_at).toLocaleString()}</p>
    <p>{t.members.length} resources · {mapped} with site identity · {sites.size} distinct mapped sites. These counts describe this saved selection.</p>
    <p>Seed policy: {t.seed_mode} · Graph policy: {t.policy_version} · Format: {t.schema_version}</p>
    <p>Seeds: {seeds.map(m => m.title).join("; ")}</p>
    {t.run ? <p>
      {t.run.public_readable ? "Published run available" : "Your completed run · not currently public"}: {t.run.methodology}.
      {" "}Completed {new Date(t.run.completed_at).toLocaleString()}.
      {" "}Site evidence: {t.run.site_evidence_state.replaceAll("_", " ")}; resource evidence: {t.run.resource_evidence_state.replaceAll("_", " ")}.
      {t.run.stale && " Inputs changed since this run."}{" "}
      <a href={`${trust}&run=${t.run.id}`}>Inspect stored run</a>. No template trust score is assigned.
    </p> : <p>No completed run is available to you. This is a saved seed policy with no displayed graph ranking.</p>}
    {!!t.origins.length && <ul aria-label="Visible starting versions">{t.origins.map(o => <li key={o.version_id}>
      Starting version: <a href={`/packs/${o.pack_id}?version=${o.version_id}`}>{o.title} · revision {o.pack_revision} · {o.version_id.slice(0, 8)}</a> · author {o.owner_id ?? "Unattributed"}
    </li>)}</ul>}
    <details><summary>Seeds, rationale and separate public adoption by resource</summary>
      <ul>{t.members.map(m => <li key={m.source_id} style={{ marginBottom: 12 }}>
        {safeSourceUrl(m.url) ? <a href={safeSourceUrl(m.url)!} target="_blank" rel="noopener noreferrer">{m.title}</a> : m.title}
        {m.is_seed && <p>Seed rationale: {m.rationale}</p>}
        <p className="panel-sub">Public adoption: {m.adoption.value.toFixed(4)} / 2 · {m.adoption.curators} curators · {m.adoption.pack_count} public packs · uncapped sum {m.adoption.reciprocal_rank_sum.toFixed(4)}.</p>
      </li>)}</ul>
    </details>
    <p><a href={url}>Inspect version</a> · <a href={`${url}#template-fork`}>Fork this version</a> · <a href={`${url}#template-merge`}>Merge from this version</a> · <a href={trust}>Open trust workspace</a></p>
  </article>;
}
