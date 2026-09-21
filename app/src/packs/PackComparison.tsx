"use client";

import { useEffect, useState } from "react";
import { compareEntries, type RankedEntry } from "./browse";
import { UUID } from "./model";

type PackSummary = { id: string; title: string; is_public: boolean };
type Detail = PackSummary & { category: string; owner_id: string; revision?: number; tn_pack_sources: RankedEntry[] };

export default function PackComparison({ token, initialId = "" }: { token?: string; initialId?: string }) {
  const [options, setOptions] = useState<PackSummary[]>([]);
  const [left, setLeft] = useState(initialId), [right, setRight] = useState("");
  const [pair, setPair] = useState<[Detail, Detail] | null>(null);
  const [error, setError] = useState("");
  const [optionsError, setOptionsError] = useState("");
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0);
  const [differences, setDifferences] = useState(false);
  useEffect(() => {
    const ctrl = new AbortController();
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
    setOptionsLoading(true); setOptionsError("");
    (async () => {
      try {
        const response = await fetch("/api/packs", { headers, signal: ctrl.signal, cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Could not load packs.");
        if (!ctrl.signal.aborted) setOptions(data.packs);
      } catch (e) { if (!ctrl.signal.aborted) setOptionsError(e instanceof Error ? e.message : "Could not load packs."); }
      finally { if (!ctrl.signal.aborted) setOptionsLoading(false); }
    })();
    return () => ctrl.abort();
  }, [token, reload]);
  useEffect(() => {
    setPair(null); setError(""); setLoading(false);
    if (!UUID.test(left) || !UUID.test(right) || left === right) return;
    const ctrl = new AbortController();
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
    setLoading(true);
    (async () => {
      try {
        const result = await Promise.all([left, right].map(async id => {
          const response = await fetch(`/api/packs/${id}`, { headers, signal: ctrl.signal, cache: "no-store" });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error ?? "Could not compare packs.");
          return data.pack as Detail;
        }));
        if (!ctrl.signal.aborted) setPair(result as [Detail, Detail]);
      } catch (e) { if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : "Could not compare packs."); }
      finally { if (!ctrl.signal.aborted) setLoading(false); }
    })();
    return () => ctrl.abort();
  }, [left, right, token, reload]);
  const rows = pair ? compareEntries(pair[0].tn_pack_sources, pair[1].tn_pack_sources) : [];
  const shared = rows.filter(row => row.shared).length;
  function choose(value: string, side: "left" | "right") {
    setPair(null);
    (side === "left" ? setLeft : setRight)(value);
  }
  return <section className="panel" aria-label="Compare source packs">
    <h2>Compare source packs</h2>
    <p>See where curators agree on source selection and differ on order or notes. Shared sources do not establish agreement on a claim.</p>
    <div className="score-grid">
      {(["left", "right"] as const).map(side => <label key={side}>{side === "left" ? "First pack" : "Second pack"}
        <select className="claim-input" value={side === "left" ? left : right} onChange={e => choose(e.target.value, side)}>
          <option value="">Choose a pack</option>
          {initialId && !options.some(p => p.id === initialId) && <option value={initialId}>Current pack</option>}
          {options.map(pack => <option key={pack.id} value={pack.id}>{pack.title}{pack.is_public ? "" : " (private)"}</option>)}
        </select>
      </label>)}
    </div>
    <p className="panel-sub">Choose from the newest 50 packs visible to your account.</p>
    {left && left === right && <p role="status">Choose two different packs.</p>}
    {optionsError && <p role="alert">{optionsError} <button className="chip" onClick={() => setReload(n => n + 1)}>Retry pack list</button></p>}
    {(loading || optionsLoading) && <p role="status">Loading comparison…</p>}
    {error && <p role="alert">{error} <button className="chip" onClick={() => setReload(n => n + 1)}>Retry comparison</button></p>}
    {pair && <>
      <p>{shared} shared · {rows.filter(row => !row.right).length} only in first · {rows.filter(row => !row.left).length} only in second · {rows.filter(row => row.rankChanged).length} rank differences · {rows.filter(row => row.noteChanged).length} note differences</p>
      <label><input type="checkbox" checked={differences} onChange={e => setDifferences(e.target.checked)} /> Show differences only</label>
      <p className="panel-sub">Compared when loaded. <button className="chip" onClick={() => setReload(n => n + 1)}>Refresh both packs</button></p>
      <div className="table-wrap"><table className="spec" style={{ tableLayout: "fixed", overflowWrap: "anywhere" }}>
        <caption>Source membership, curator rank, and notes</caption>
        <thead><tr><th scope="col">Source</th>{pair.map(p => <th scope="col" key={p.id}><a href={`/packs/${p.id}`}>{p.title}</a><br />{p.is_public ? "Public" : "Private"} · {p.category}<br />{p.revision ? `Revision ${p.revision}` : "Revision unavailable"}<br />Curator: {p.owner_id}</th>)}</tr></thead>
        <tbody>{rows.filter(row => !differences || !row.shared || row.rankChanged || row.noteChanged).map(row => {
          const source = row.left?.tn_sources ?? row.right?.tn_sources;
          return <tr key={row.id}><th scope="row" style={{ textTransform: "none" }}>{source?.url && /^https?:\/\//i.test(source.url)
            ? <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a> : source?.title ?? "Source unavailable"}
            <p>{row.shared ? "Shared source" : row.left ? "Only in first" : "Only in second"}</p></th>
            {[row.left, row.right].map((entry, index) => <td key={index}>{entry ? <><strong>Rank {entry.rank}</strong><p style={{ whiteSpace: "pre-wrap" }}>{entry.note || "No curator note."}</p></> : "Not included"}</td>)}
          </tr>;
        })}</tbody>
      </table></div>
      {differences && rows.every(row => row.shared && !row.rankChanged && !row.noteChanged) && <p>The source selections, ranks, and notes match.</p>}
      <p className="panel-sub">Matched by source record ID. Comparison does not alter either pack or canonical confidence.</p>
    </>}
  </section>;
}
