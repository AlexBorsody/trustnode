"use client";
import { useEffect, useRef, useState } from "react";
import { requestJson } from "../trust/client";
import type { ReferenceComparison } from "./template-reference";

export default function TemplateReference({ run, category, token }: { run: string; category: string; token?: string }) {
  const [data, setData] = useState<ReferenceComparison | null>(null), [error, setError] = useState("");
  const [cursors, setCursors] = useState<(string | null)[]>([null]), [page, setPage] = useState(0);
  const [busy, setBusy] = useState(true), [refresh, setRefresh] = useState(0);
  const active = useRef<AbortController | null>(null), exporting = useRef<AbortController | null>(null);
  const pin = useRef<{ hash: string; scope: string } | null>(null), cursor = cursors[page];
  const query = () => {
    const q = new URLSearchParams({ reference: run }); if (category) q.set("category", category);
    if (pin.current) { q.set("input_hash", pin.current.hash); q.set("scope_hash", pin.current.scope); } return q;
  };
  function clear() { active.current?.abort(); exporting.current?.abort(); setData(null); setError(""); setBusy(true); }
  function restart() { clear(); pin.current = null; setPage(0); setCursors([null]); setRefresh(n => n + 1); }
  useEffect(() => {
    const ctrl = new AbortController(); active.current = ctrl; setData(null); setError(""); setBusy(true);
    const q = query(); if (cursor) q.set("cursor", cursor);
    requestJson<ReferenceComparison>(`/api/templates/compare?${q}`, token, ctrl.signal, undefined, "Reference comparison is unavailable.")
      .then(result => { if (!ctrl.signal.aborted) { pin.current = { hash: result.reference.input_hash, scope: result.scope.hash }; setData(result); } })
      .catch(e => { if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : "Could not load comparison."); })
      .finally(() => { if (!ctrl.signal.aborted) setBusy(false); });
    const focus = () => {
      if (document.visibilityState === "visible") { clear(); setRefresh(n => n + 1); }
    };
    window.addEventListener("focus", focus); document.addEventListener("visibilitychange", focus);
    return () => { ctrl.abort(); exporting.current?.abort(); window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", focus); };
  }, [run, category, cursor, token, refresh]);
  async function download() {
    if (!data || busy) return;
    const ctrl = new AbortController(); exporting.current = ctrl; setBusy(true); setError("");
    try {
      const response = await fetch(`/api/templates/compare/export?${query()}`, { cache: "no-store", signal: ctrl.signal, headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!response.ok) { const failure = await response.json(); throw new Error(failure.error ?? "Could not export comparison."); }
      const blob = await response.blob(); if (ctrl.signal.aborted) return;
      const url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = `template-comparison-${run}.json`;
      a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { if (!ctrl.signal.aborted) { setData(null); setError(e instanceof Error ? e.message : "Could not export comparison."); } }
    finally { if (!ctrl.signal.aborted) setBusy(false); }
  }
  return <section aria-label="Independent reference comparison">
    <h2>Comparison against your chosen reference</h2>
    <p>This is a view of the newest 50 accessible saved versions in {category || "all categories"}, excluding all versions of the reference pack. That exclusion is not proof of independent evidence. Public adoption does not enter this comparison.</p>
    {busy && <p role="status">Loading reference comparison…</p>}
    {error && <p role="alert">{error}</p>}
    <button className="chip" disabled={busy} onClick={restart}>Restart reference comparison</button>
    {data && <>
      <div className="panel">
        <p>Reference: <a href={`/trust?run=${data.reference.run_id}`}>{data.reference.run_id}</a> · {data.reference.public_readable ? "Published and currently readable" : "Accessible to your account"}</p>
        <p>Reference category: {data.reference.category} · Site evidence: {data.reference.site_evidence_state.replaceAll("_", " ")}{data.reference.stale ? " · Inputs changed since this frozen run" : ""}.</p>
        <p>Method: {data.reference.algorithm.methodology} / {data.reference.algorithm.implementation} · Comparison metric: {data.metric}</p>
        <p style={{ overflowWrap: "anywhere" }}>Pinned input hash: {data.reference.input_hash}</p>
        <p style={{ overflowWrap: "anywhere" }}>Scope fingerprint: {data.scope.hash}</p>
        <p>{data.scope.count} selected versions, newest {data.scope.limit} maximum.{data.scope.has_more ? " More accessible versions exist outside this comparison." : ""} This is not a global category ranking.</p>
        <p>{data.scope.graph_scope} Different category identities are labeled below, even when their paths match.</p>
        <p>Median uses each distinct site with a reference score once. Missing sites are unknown, not zero. Coverage is scored sites / all distinct site identities in the selected template; members with no site identity are reported separately. Raw authority is not factual accuracy.</p>
        <button className="chip" disabled={busy} onClick={download}>Export reference comparison</button>
      </div>
      {!data.templates.length && <p>No eligible accessible templates in this comparison scope.</p>}
      {data.templates.map(t => <article className="panel" key={t.id} aria-label={t.title}>
        <h3><a href={`/packs/${t.pack_id}?version=${t.id}`}>{t.title}</a></h3>
        <p>Version {t.id} · saved revision {t.pack_revision} · author {t.owner_id ?? "Unattributed"} · {t.is_public ? "Public" : "Private"}</p>
        <p>Category: {t.category} · {t.same_category_identity ? "Same category identity as reference" : "Different category identity from reference"} · seed policy {t.seed_mode} · edge policy {t.policy_version}.</p>
        <p>Median raw site authority: <strong>{t.median_site_mass === null ? "Unknown — no scored sites" : t.median_site_mass.toPrecision(8)}</strong> · Coverage: {t.mapped_sites} / {t.total_sites} distinct sites · {t.unmapped_resources} members without site identity.</p>
        <details><summary>Site values used in the median</summary><ul>{t.sites.map(s => <li key={s.id}>{s.id}: {s.mass === null ? "Unknown in reference" : String(s.mass)}</li>)}</ul></details>
        <a href={`/trust?pack=${t.pack_id}&version=${t.id}`}>Inspect this template’s own graph separately</a>
      </article>)}
      <nav aria-label="Reference comparison pages">
        <button className="chip" disabled={busy || page === 0} onClick={() => { clear(); setPage(n => n - 1); }}>Previous comparison page</button>{" "}
        <button className="chip" disabled={busy || !data.next_cursor} onClick={() => { if (!data.next_cursor) return; clear(); setCursors(c => [...c.slice(0, page + 1), data.next_cursor]); setPage(n => n + 1); }}>More compared templates</button>
        <span> Page {page + 1}</span>
      </nav>
    </>}
  </section>;
}
