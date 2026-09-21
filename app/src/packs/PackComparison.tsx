"use client";

import { useEffect, useState } from "react";
import { compareEntries, type RankedEntry } from "./browse";
import { UUID, type ForkOrigin, type PackSource } from "./model";

type PackSummary = { id: string; title: string; is_public: boolean };
type Detail = PackSummary & { description: string; tags: string[]; ancestry_available?: boolean; category: string; owner_id: string; revision?: number; tn_pack_sources: RankedEntry[] };

export type MergeDraft = {
  parents: ForkOrigin[]; title: string; description: string; category: string; tags: string[];
  entries: { source: PackSource; note: string }[];
};
export default function PackComparison({ token, initialId = "", onMerge, canMerge }: {
  token?: string; initialId?: string; onMerge: (draft: MergeDraft) => void; canMerge: boolean;
}) {
  const [options, setOptions] = useState<PackSummary[]>([]);
  const [left, setLeft] = useState(initialId), [right, setRight] = useState("");
  const [pair, setPair] = useState<[Detail, Detail] | null>(null);
  const [error, setError] = useState("");
  const [optionsError, setOptionsError] = useState("");
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0);
  const [selection, setSelection] = useState<Record<string, "left" | "right">>({});
  const [differences, setDifferences] = useState(false);
  useEffect(() => {
    const ctrl = new AbortController();
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
    setOptionsLoading(true); setOptionsError(""); setOptions([]);
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
        if (!ctrl.signal.aborted) {
          setPair(result as [Detail, Detail]);
          const initial = compareEntries(result[0].tn_pack_sources, result[1].tn_pack_sources)
            .filter(row => row.left?.tn_sources || row.right?.tn_sources).slice(0, 50);
          setSelection(Object.fromEntries(initial.map(row => [row.id, row.left ? "left" : "right"])));
        }
      } catch (e) { if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : "Could not compare packs."); }
      finally { if (!ctrl.signal.aborted) setLoading(false); }
    })();
    return () => ctrl.abort();
  }, [left, right, token, reload]);
  const rows = pair ? compareEntries(pair[0].tn_pack_sources, pair[1].tn_pack_sources) : [];
  const shared = rows.filter(row => row.shared).length;
  function prepareMerge() {
    if (!pair || !canMerge || !token || !pair.every(p => p.revision && p.ancestry_available)) return;
    onMerge({
      parents: pair.map(p => ({ id: p.id, revision: p.revision! })),
      title: `${pair[0].title} + ${pair[1].title}`.slice(0, 120),
      description: pair[0].description, category: pair[0].category, tags: pair[0].tags,
      entries: rows.filter(row => selection[row.id]).map(row => ({
        source: (row.left?.tn_sources ?? row.right?.tn_sources)!, note: row[selection[row.id]]!.note,
      })),
    });
  }
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
      {token && <div className="gate">
        <h3>Build a merged draft</h3>
        <p>Choose up to 50 sources and which curator's note to start with. Shared sources appear once. The draft starts private with the first pack's topic, description and tags; review its order and notes before saving.</p>
        <p>{Object.keys(selection).length}/50 sources selected. Attribution to each original is visible only to readers who can access it.</p>
        {!canMerge && <p>Save or discard your current pack draft before starting a merge.</p>}
        {!pair.every(p => p.revision && p.ancestry_available) && <p>These packs are not ready for attributed merging yet.</p>}
        <button className="btn" disabled={!canMerge || !Object.keys(selection).length || !pair.every(p => p.revision && p.ancestry_available)} onClick={prepareMerge}>Review merged draft</button>
      </div>}
      {!token && <p><a href={`/login?next=${encodeURIComponent(initialId ? `/packs/${initialId}` : "/packs")}`}>Sign in</a> to build a merged draft.</p>}
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
            <p>{row.shared ? "Shared source" : row.left ? "Only in first" : "Only in second"}</p>
            {token && <label><input type="checkbox" aria-label={`Include ${source?.title ?? "unavailable source"}`} checked={!!selection[row.id]}
              disabled={!source || (!selection[row.id] && Object.keys(selection).length >= 50)}
              onChange={e => setSelection(current => { const next = { ...current }; if (e.target.checked) next[row.id] = row.left ? "left" : "right"; else delete next[row.id]; return next; })} /> Include in merge</label>}
            </th>
            {[row.left, row.right].map((entry, index) => <td key={index}>{entry ? <><strong>Rank {entry.rank}</strong>
              {token && row.shared && <label style={{ display: "block" }}><input type="radio" name={`note-${row.id}`} checked={selection[row.id] === (index === 0 ? "left" : "right")} disabled={!selection[row.id]}
                onChange={() => setSelection(current => ({ ...current, [row.id]: index === 0 ? "left" : "right" }))} /> Use this note</label>}
              <p style={{ whiteSpace: "pre-wrap" }}>{entry.note || "No curator note."}</p></> : "Not included"}</td>)}
          </tr>;
        })}</tbody>
      </table></div>
      {differences && rows.every(row => row.shared && !row.rankChanged && !row.noteChanged) && <p>The source selections, ranks, and notes match.</p>}
      <p className="panel-sub">Matched by source record ID. Neither comparison nor saving a merged draft changes the originals or canonical confidence.</p>
    </>}
  </section>;
}
