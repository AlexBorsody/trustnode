"use client";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/auth/useAuth";
import type { RankingResult } from "@/trustnode/ranking";
import type { Verification } from "@/trustnode/pipeline";
interface Pack { id: string; title: string; is_public: boolean }
interface Result {
  query: string; algorithm_version: string; results: RankingResult[]; warnings: string[]; note: string;
  controls: { limit: number; use_pack_signals: boolean; pack_id?: string };
  selected_pack: Pack | null;
  corpus: { candidates: number; community_rows: number; public_packs: number; shelf_status: string; pack_status: string;
    limits: { community_sources: number; public_packs: number; results: number } };
  canonical_verification: Verification;
}
export default function ExplorePage() {
  const { session } = useAuth();
  const [query, setQuery] = useState("PKCE protects OAuth public clients against authorization code interception attacks");
  const [packs, setPacks] = useState<Pack[]>([]);
  const [packId, setPackId] = useState("");
  const [packNotice, setPackNotice] = useState("");
  const [limit, setLimit] = useState(6);
  const [usePacks, setUsePacks] = useState(true);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const request = useRef<AbortController | null>(null);
  const token = session?.access_token;
  useEffect(() => {
    const params = new URL(window.location.href).searchParams;
    setPackId(params.get("pack") ?? "");
    if (params.get("query")) setQuery(params.get("query")!.slice(0, 500));
  }, []);
  useEffect(() => {
    const ctrl = new AbortController();
    request.current?.abort(); setResult(null); setLoading(false); setPacks([]);
    fetch("/api/packs", { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: ctrl.signal, cache: "no-store" })
      .then(async res => { const data = await res.json(); if (!res.ok) throw new Error(data.error); return data; })
      .then(data => { if (!ctrl.signal.aborted) { setPacks(data.packs); setPackNotice(""); } })
      .catch(() => { if (!ctrl.signal.aborted) setPackNotice("Pack selection is unavailable. You can still explore the source corpus."); });
    return () => { ctrl.abort(); request.current?.abort(); };
  }, [token]);
  async function run(e: React.FormEvent) {
    e.preventDefault(); request.current?.abort(); const ctrl = new AbortController(); request.current = ctrl;
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await fetch("/api/retrieve", { method: "POST", signal: ctrl.signal, cache: "no-store",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ query, limit, use_pack_signals: usePacks, ...(packId ? { pack_id: packId } : {}) }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error ?? "Could not retrieve sources.");
      if (!ctrl.signal.aborted) setResult(data);
    } catch (e) { if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : "Could not retrieve sources."); }
    finally { if (!ctrl.signal.aborted) setLoading(false); }
  }
  const canonical = result?.canonical_verification;
  const hasAnalyzedClaim = canonical?.sources.some(source => source.origin === "seed" && source.stance !== "unrelated");
  return <>
    <div className="meta-line">SOURCE EXPLORER · EVERY RANK SHOWS ITS WORK</div>
    <h1 className="page-title">Find sources worth examining</h1>
    <p className="page-sub">Search the evidence, inspect why each source ranks, and compare the effect of public source packs. A retrieval score helps you choose what to read; it does not establish that a claim is true.</p>
    <form className="panel" onSubmit={run}>
      <label htmlFor="source-query">Claim or research question</label>
      <textarea id="source-query" className="claim-input" rows={3} required maxLength={500} value={query} onChange={e => setQuery(e.target.value)} />
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", margin: "16px 0" }}>
        <label style={{ flex: "1 1 240px" }}>Source scope
          <select className="claim-input" value={packId} onChange={e => setPackId(e.target.value)}>
            <option value="">All available sources</option>
            {packId && !packs.some(p => p.id === packId) && <option value={packId}>Linked pack</option>}
            {packs.map(p => <option key={p.id} value={p.id}>{p.title}{p.is_public ? "" : " (private)"}</option>)}
          </select>
        </label>
        <label>Result count<input className="claim-input" style={{ maxWidth: 100 }} type="number" min={1} max={20} required value={limit} onChange={e => setLimit(Number(e.target.value))} /></label>
      </div>
      <label><input type="checkbox" checked={usePacks} onChange={e => setUsePacks(e.target.checked)} /> Include public pack adoption in retrieval order</label>
      <p className="panel-sub">One curator contributes at most one rank signal per source. Private packs restrict your source scope; they never contribute to public adoption. These controls do not change the canonical verification score.</p>
      {packNotice && <p role="status">{packNotice}</p>}
      <button className="btn" disabled={loading || !query.trim()}>{loading ? "Finding sources…" : "Explore sources"}</button>{" "}
      <a href="/packs" className="chip">Curate a source pack</a>
      {error && <p role="alert">{error}</p>}
    </form>
    {result && <>
      <h2>Results for “{result.query}”</h2>
      <p className="panel-sub">{result.selected_pack ? `Scope: ${result.selected_pack.title}` : "Scope: all available sources"} · Public pack influence {result.controls.use_pack_signals ? "on" : "off"} · Up to {result.controls.limit} results</p>
      {result.warnings.map(warning => <p className="panel" role="status" key={warning}>{warning}</p>)}
      {canonical && <section className="panel" aria-label="Independent canonical verification">
        <h2>Independent seed-based check</h2>
        <p className="panel-sub">OAuth/PKCE prototype corpus, including demo fixtures. This check does not use your selected pack or retrieval controls. Analyst-assigned weights are not measured factual accuracy.</p>
        {canonical.conflicts.length > 0 && <div><h3>Conflicts to inspect</h3>{canonical.conflicts.map((c, i) => <p key={i}>{c.detail}</p>)}</div>}
        {hasAnalyzedClaim
          ? <p><strong>{canonical.confidence.value}/100 — {canonical.confidence.level}</strong></p>
          : <p><strong>No analyzed claim match in the seed corpus.</strong> Matching research terms do not by themselves establish a claim to verify.</p>}
        <div className="formula">{canonical.confidence.derivation}</div>
        <a href={`/verify?claim=${encodeURIComponent(result.query)}`}>Inspect the canonical quotes and evidence chain →</a>
      </section>}
      {!result.results.length && <div className="panel"><h3>No matching sources in this scope</h3><p>Try other query terms, choose a broader pack, or <a href="/sources">add a relevant link</a>. This is a retrieval limit, not a verdict on your claim.</p></div>}
      {result.results.map((source, index) => <article className="panel" key={source.id} style={{ overflowWrap: "anywhere" }}>
        <h3>{index + 1}. <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></h3>
        <p className="panel-sub">{source.origin === "seed" ? "Analyst-seeded reference" : "Community source — no earned trust yet"}{source.superseded_by ? ` · Superseded by ${source.superseded_by}` : ""}</p>
        <p><strong>Retrieval score: {source.score}</strong> · {source.pack_summary.curators} public curators across {source.pack_summary.pack_count} packs</p>
        <div className="formula">{source.derivation}</div>
        <p className="panel-sub">Matched terms: {source.matched_terms.join(", ")}</p>
        {source.text && <p>{source.text.slice(0, 320)}{source.text.length > 320 ? "…" : ""}</p>}
        {!!source.pack_references?.length && <details><summary>Inspect public pack provenance</summary><ul>{[...new Set(source.pack_references.map(p => p.pack_id))].map(id => <li key={id}><a href={`/packs/${id}`}>Public pack {id}</a></li>)}</ul></details>}
      </article>)}
      <details className="panel"><summary>Methodology and corpus limits</summary>
        <p>{result.note}</p>
        <p>Algorithm {result.algorithm_version}. Eligible candidates: {result.corpus.candidates}. Scanned {result.corpus.community_rows} community rows and {result.corpus.public_packs} public packs. Scan caps: newest {result.corpus.limits.community_sources} ready links and {result.corpus.limits.public_packs} public packs.</p>
        <p>Pack adoption is an observed curation signal, not measured reliability. Graph corroboration and evidence-directness scoring are not implemented yet. No freshness bonus is inferred from the date a contributor added a link.</p>
      </details>
    </>}
  </>;
}
