"use client";
import { useEffect, useRef, useState } from "react";
import { seedDistribution, type SeedMode, type TemplateEntry, type TemplateVersion } from "./templates";
import EvidencePanel from "@/sources/EvidencePanel";

interface Loaded {
  pack: { revision: number; tn_pack_sources: { source_id: string; rank: number; note: string; tn_sources: {
    title: string; url: string | null; status: string; site_id: string | null;
    normalized_url: string | null; tn_sites: { host: string } | null;
  } | null }[] };
  versions: TemplateVersion[];
}

export default function SeedTemplates({ packId, token, userId, isOwner, disabled }: {
  packId: string; token?: string; userId?: string; isOwner: boolean; disabled: boolean;
}) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<SeedMode>("uniform-seeds-v1");
  const [selected, setSelected] = useState("");
  const [revision, setRevision] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [reload, setReload] = useState(0);
  const request = useRef<AbortController | null>(null);
  const auth: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  useEffect(() => {
    const ctrl = new AbortController(); request.current = ctrl;
    setLoaded(null); setRevision(null); setChoices({}); setConflict(false); setError(""); setNotice(""); setBusy(true);
    const linked = new URL(window.location.href).searchParams.get("version");
    fetch(`/api/packs/${packId}/versions${linked ? `?version=${encodeURIComponent(linked)}` : ""}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: ctrl.signal, cache: "no-store",
    }).then(async res => { const data = await res.json(); if (!res.ok) throw new Error(data.error); return data as Loaded; })
      .then(data => {
        if (ctrl.signal.aborted) return;
        setLoaded(data); setRevision(data.pack.revision); setSelected(data.versions[0]?.id ?? "");
        const latest = data.versions[0];
        if (latest && latest.pack_revision === data.pack.revision) {
          setChoices(Object.fromEntries(latest.snapshot.entries.filter(e => e.is_seed).map(e => [e.source_id, e.rationale])));
          setMode(latest.snapshot.seed_mode);
        } else setMode("uniform-seeds-v1");
      }).catch(e => { if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : "Could not load seed templates."); })
      .finally(() => { if (!ctrl.signal.aborted) setBusy(false); });
    return () => { ctrl.abort(); request.current?.abort(); };
  }, [packId, token, reload]);

  async function save(e: React.FormEvent) {
    e.preventDefault(); if (!token || revision === null) return;
    request.current?.abort(); const ctrl = new AbortController(); request.current = ctrl;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/packs/${packId}/versions`, {
        method: "POST", cache: "no-store", signal: ctrl.signal,
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({ revision, seed_mode: mode, seeds: Object.entries(choices).map(([source_id, rationale]) => ({ source_id, rationale })) }),
      });
      const result = await response.json();
      if (ctrl.signal.aborted) return;
      if (response.status === 409) setConflict(true);
      if (!response.ok) throw new Error(result.error ?? "Could not save the seed template.");
      const read = await fetch(`/api/packs/${packId}/versions`, { headers: auth, signal: ctrl.signal, cache: "no-store" });
      const data = await read.json();
      if (!read.ok) throw new Error("Version saved, but it could not be reloaded. Retry loading to inspect it.");
      if (!ctrl.signal.aborted) { setLoaded(data); setSelected(result.id); setNotice("Template version saved. Its sources and seed choices are fixed."); }
    } catch (e) { if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : "Could not save the seed template. Your choices are retained."); }
    finally { if (!ctrl.signal.aborted) setBusy(false); }
  }

  const entries: TemplateEntry[] = (loaded?.pack.tn_pack_sources ?? []).flatMap(e => e.tn_sources ? [{
    source_id: e.source_id, rank: e.rank, note: e.note, title: e.tn_sources.title,
    url: e.tn_sources.url, normalized_url: e.tn_sources.normalized_url, status: e.tn_sources.status,
    site_id: e.tn_sources.site_id, site_host: e.tn_sources.tn_sites?.host ?? null,
    is_seed: Object.hasOwn(choices, e.source_id), rationale: choices[e.source_id] ?? "",
  }] : []).sort((a, b) => a.rank - b.rank);
  const preview = seedDistribution(entries, mode);
  const version = loaded?.versions.find(v => v.id === selected);
  const distribution = version && seedDistribution(version.snapshot.entries, version.snapshot.seed_mode);
  function download() {
    if (!version) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify({ ...version, distribution }, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `trustnode-template-${version.id}.json`; link.click(); URL.revokeObjectURL(url);
  }
  return <section className="panel" aria-label="Category seed templates">
    <h2>Category seed templates</h2>
    <p className="panel-sub">A saved version preserves this category’s links, order and seed rationale. Seed weight is a declared starting preference; graph trust has not been computed yet.</p>
    {busy && <p role="status">{loaded ? "Saving template…" : "Loading templates…"}</p>}
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {error && <button className="chip" disabled={busy} onClick={() => setReload(n => n + 1)}>{conflict ? "Discard seed draft and reload latest pack" : loaded ? "Discard seed draft and reload templates" : "Retry loading templates"}</button>}
    {loaded && isOwner && <form onSubmit={save}>
      <fieldset disabled={disabled || busy || conflict} style={{ border: 0, padding: 0, minWidth: 0 }}>
        <legend>Capture pack revision {revision}</legend>
        <label>Seed weighting<select className="claim-input" value={mode} onChange={e => setMode(e.target.value as SeedMode)}>
          <option value="uniform-seeds-v1">Equal weight for each chosen seed</option>
          <option value="ordered-seeds-v1">Weight by chosen seeds’ order in this pack</option>
        </select></label>
        <p className="panel-sub">Only checked links are seeds. Ordered seeds get weights 1, 1/2, 1/3… before normalization. Multiple seeds on one site count only that site’s strongest weight.</p>
        {entries.map(entry => <div key={entry.source_id} style={{ marginBottom: 16 }}>
          <label><input type="checkbox" checked={entry.is_seed} disabled={!entry.site_id || entry.status !== "ready"}
            onChange={e => setChoices(current => { const next = { ...current }; if (e.target.checked) next[entry.source_id] = ""; else delete next[entry.source_id]; return next; })} /> {entry.rank}. {entry.title}</label>
          <p className="panel-sub">{entry.site_host ?? "Site identity unavailable"} · {entry.status}{entry.site_id && entry.status === "ready" ? "" : " — cannot be a seed yet"}</p>
          {entry.is_seed && <label>Why is this a starting source?<textarea className="claim-input" required maxLength={1000} value={entry.rationale}
            onChange={e => setChoices(current => ({ ...current, [entry.source_id]: e.target.value }))} /></label>}
        </div>)}
        {!!preview.sites.length && <p>Starting site distribution: {preview.sites.map(s => `${s.host} ${(100 * s.mass).toFixed(1)}%`).join(" · ")}</p>}
        <p className="panel-sub">Versions follow the pack’s visibility. Publishing exposes its saved versions; making it private hides them. Deleting the pack deletes its versions.</p>
        <button className="btn" disabled={!Object.keys(choices).length}>Save template version</button>
      </fieldset>
      {disabled && <p>Finish editing the pack before saving a seed template.</p>}
    </form>}
    {loaded && !loaded.versions.length && <p>No seed template versions saved yet.</p>}
    {!!loaded?.versions.length && <div style={{ marginTop: 24 }}>
      <label>Saved version<select className="claim-input" value={selected} onChange={e => setSelected(e.target.value)}>
        {loaded.versions.map(v => <option key={v.id} value={v.id}>{new Date(v.created_at).toLocaleString()} · revision {v.pack_revision} · {v.id.slice(0, 8)}</option>)}
      </select></label>
      <p className="panel-sub">Up to 20 recent versions. A version’s direct link opens it even after it leaves this list.</p>
      {version && <>
        <h3>{version.snapshot.title} · {version.snapshot.category}</h3>
        <p>{version.snapshot.seed_mode === "uniform-seeds-v1" ? "Equal seed weights" : "Ordered seed weights"} · {version.snapshot.entries.length} fixed resource entries</p>
        {version.pack_revision !== loaded.pack.revision && <p>This version captures an earlier pack revision. Its contents are unchanged.</p>}
        <ol>{version.snapshot.entries.map(entry => <li key={entry.source_id} style={{ marginBottom: 10 }}>
          {entry.title} · {entry.site_host ?? "No site identity"} · {entry.is_seed ? "Seed" : "Member"}
          {entry.is_seed && <p>{entry.rationale} · Resource seed mass {((distribution?.resources.find(s => s.id === entry.source_id)?.mass ?? 0) * 100).toFixed(1)}%</p>}
        </li>)}</ol>
        <p>Site seed mass: {distribution?.sites.map(s => `${s.host} ${(100 * s.mass).toFixed(1)}%`).join(" · ")}</p>
        <p className="panel-sub" style={{ overflowWrap: "anywhere" }}>Content fingerprint: {version.content_hash}</p>
        <a className="chip" href={`/packs/${packId}?version=${version.id}`}>Open this version</a>{" "}
        <button className="chip" onClick={download}>Download template JSON</button>
        <EvidencePanel key={`${version.id}:${token ?? 'anonymous'}`} version={version} token={token} userId={userId} isOwner={isOwner} />
      </>}
    </div>}
  </section>;
}
