"use client";

import { useEffect, useRef, useState } from "react";
import { createClient, type Session } from "@supabase/supabase-js";
import type { PackInput } from "./model";

type Source = { id: string; title: string; url: string | null; kind: string; status: string };
type Pack = Omit<PackInput, "entries"> & { id: string; owner_id: string; created_at: string; revision?: number; updated_at?: string;
  tn_pack_sources?: { source_id: string; rank: number; note: string; tn_sources: Source | null }[] };
type Entry = { source: Source; note: string };
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPA_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const configured = SUPA_URL.startsWith("http") && SUPA_KEY.length > 20;
const style = { display: "block", marginBottom: 14 };

export default function PackWorkspace({ id }: { id?: string }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!configured);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [pack, setPack] = useState<Pack | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [editing, setEditing] = useState(!id);
  const [editRevision, setEditRevision] = useState<number | null>(null);
  const [deleteRevision, setDeleteRevision] = useState<number | null>(null);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [reload, setReload] = useState(0);
  const token = session?.access_token;
  const mutation = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!configured) return;
    const sb = createClient(SUPA_URL, SUPA_KEY);
    let active = true;
    sb.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      setSession(data.session); setAuthReady(true);
      if (error) setError("Could not restore sign-in. Sign in again from Sources.");
    }).catch(() => { if (active) { setAuthReady(true); setError("Could not restore sign-in."); } });
    const { data } = sb.auth.onAuthStateChange((_event, next) => { if (active) setSession(next); });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    if (!authReady) return;
    const ctrl = new AbortController();
    setLoading(true); setError(""); setPack(null); setPacks([]);
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
    (async () => {
      try {
        const res = await fetch(id ? `/api/packs/${id}` : "/api/packs", { headers, signal: ctrl.signal, cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Could not load source packs.");
        if (ctrl.signal.aborted) return;
        if (id) setPack(data.pack); else setPacks(data.packs);
      } catch (e) { if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : "Could not load source packs."); }
      finally { if (!ctrl.signal.aborted) setLoading(false); }
    })();
    return () => ctrl.abort();
  }, [id, token, authReady, reload]);
  useEffect(() => {
    if (!token || !editing) return;
    const ctrl = new AbortController();
    const params = new URLSearchParams({ limit: "100", q: query });
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/sources?${params}`, { signal: ctrl.signal });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Could not load sources.");
        if (!ctrl.signal.aborted) setSources(data.sources.filter((s: Source) => s.kind === "link"));
      } catch (e) { if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : "Could not load sources."); }
    }, 200);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [token, editing, query]);
  // Do not carry a private draft into a different signed-in account.
  useEffect(() => {
    mutation.current?.abort();
    setEntries([]); setTitle(""); setDescription(""); setCategory(""); setTags("");
    setIsPublic(false); setEditing(!id); setNotice(""); setSaving(false);
    setEditRevision(null); setDeleteRevision(null); setConflict(false);
    return () => mutation.current?.abort();
  }, [session?.user.id, id]);
  const visiblePack = pack && (pack.is_public || pack.owner_id === session?.user.id) ? pack : null;
  function move(index: number, direction: number) {
    setEntries(current => {
      const next = [...current];
      [next[index], next[index + direction]] = [next[index + direction], next[index]];
      return next;
    });
  }
  function beginDraft(copy: boolean) {
    if (!pack) return;
    if (!copy && (!pack.revision || pack.owner_id !== session?.user.id)) return;
    setEditRevision(copy ? null : pack.revision!); setDeleteRevision(null); setConflict(false); setError("");
    setTitle(copy ? `${pack.title} (copy)`.slice(0, 120) : pack.title); setDescription(pack.description);
    setCategory(pack.category); setTags(pack.tags.join(", ")); setIsPublic(copy ? false : pack.is_public);
    setEntries((pack.tn_pack_sources ?? []).filter(e => e.tn_sources).map(e => ({ source: e.tn_sources!, note: e.note })));
    setEditing(true); setNotice(copy ? "Your copy starts private. Adjust the order, then save a new pack." : "Editing this pack. Saved changes will appear at the same address.");
  }
  function discardDraft() {
    setEditing(false); setEditRevision(null); setEntries([]); setError(""); setNotice(""); setConflict(false);
  }
  async function save(e: React.FormEvent) {
    e.preventDefault(); if (!token) return;
    const ctrl = new AbortController(); mutation.current = ctrl;
    const updating = editRevision !== null;
    setSaving(true); setError(""); setConflict(false);
    try {
      const res = await fetch(updating ? `/api/packs/${id}` : "/api/packs", {
        method: updating ? "PATCH" : "POST", signal: ctrl.signal, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title, description, category, tags: tags.split(",").map(t => t.trim()).filter(Boolean), is_public: isPublic,
          ...(updating ? { revision: editRevision } : {}),
          entries: entries.map(e => ({ source_id: e.source.id, note: e.note })) }),
      });
      const data = await res.json();
      if (ctrl.signal.aborted) return;
      if (res.status === 409) setConflict(true);
      if (!res.ok) throw new Error(data.error ?? "Could not save pack.");
      if (updating) {
        discardDraft(); setNotice("Pack updated."); setReload(r => r + 1);
      } else window.location.assign(`/packs/${data.id}`);
    } catch (e) { if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : "Could not save pack. Your draft is still here."); }
    finally { if (!ctrl.signal.aborted) setSaving(false); }
  }
  async function deletePack() {
    if (!token || deleteRevision === null) return;
    const ctrl = new AbortController(); mutation.current = ctrl;
    setSaving(true); setError(""); setConflict(false);
    try {
      const res = await fetch(`/api/packs/${id}`, {
        method: "DELETE", signal: ctrl.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ revision: deleteRevision }),
      });
      const data = await res.json();
      if (ctrl.signal.aborted) return;
      if (res.status === 409) setConflict(true);
      if (!res.ok) throw new Error(data.error ?? "Could not delete pack.");
      window.location.assign("/packs");
    } catch (e) { if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : "Could not delete pack. Try again."); }
    finally { if (!ctrl.signal.aborted) setSaving(false); }
  }
  async function share() {
    try { await navigator.clipboard.writeText(window.location.href); setNotice("Public pack link copied."); }
    catch { setNotice(`Share this address: ${window.location.href}`); }
  }
  return <>
    <div className="meta-line">SOURCE PACKS · CURATED ORDER · VISIBLE REASONS</div>
    <h1 className="page-title">{id ? "A curator’s source map" : "Build a source map"}</h1>
    <p className="page-sub">Collect links for a topic, put them in the order you trust, and explain why. Pack order is curator preference; it does not change canonical confidence.</p>
    <p><a href="/packs">Browse packs</a> · <a href="/sources">Contribute a source or sign in</a></p>
    {error && <div className="panel" role="alert"><p>{error}</p>{conflict
      ? <button className="chip" disabled={saving} onClick={() => window.location.reload()}>Discard draft and reload latest pack</button>
      : <button className="chip" disabled={saving} onClick={() => setReload(r => r + 1)}>Retry loading packs</button>}</div>}
    {notice && <p role="status">{notice}</p>}
    {loading && <p role="status">Loading packs…</p>}
    {visiblePack && pack && <section className="panel">
      <h2>{pack.title} <span className="tag">{pack.is_public ? "Public" : "Private"}</span></h2>
      <p>{pack.description}</p>
      <p className="panel-sub">{pack.category} · {pack.tags.map(t => `#${t}`).join(" ")}</p>
      <p className="panel-sub" style={{ overflowWrap: "anywhere" }}>Curator: {pack.owner_id} · {new Date(pack.created_at).toLocaleDateString()}</p>
      <ol style={{ paddingLeft: 24 }}>{pack.tn_pack_sources?.map(e => <li key={e.source_id} style={{ marginBottom: 18, overflowWrap: "anywhere" }}>
        {e.tn_sources?.url && /^https?:\/\//i.test(e.tn_sources.url)
          ? <a href={e.tn_sources.url} target="_blank" rel="noreferrer">{e.tn_sources.title}</a>
          : e.tn_sources?.title ?? "Source unavailable"}
        {e.note && <p>{e.note}</p>}
        <small>Curator rank {e.rank} · {e.tn_sources?.status ?? "unavailable"}</small>
      </li>)}</ol>
      <p><a className="btn" href={`/explore?pack=${pack.id}`}>Explore these sources →</a></p>
      {pack.is_public && <button className="btn" onClick={share}>Copy share link</button>}{" "}
      {session && !editing && <button className="chip" disabled={saving || deleteRevision !== null} onClick={() => beginDraft(true)}>Make my own copy</button>}
      {pack.owner_id === session?.user.id && !editing && pack.revision && <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
        <button className="btn" disabled={saving || deleteRevision !== null} onClick={() => beginDraft(false)}>Edit pack</button>
        <button className="chip" disabled={saving || deleteRevision !== null} onClick={() => { setDeleteRevision(pack.revision!); setError(""); setNotice(""); setConflict(false); }}>Delete pack</button>
      </div>}
      {pack.owner_id === session?.user.id && !pack.revision && <p>Editing is not available for this pack yet. You can still make a copy.</p>}
      {deleteRevision !== null && pack.owner_id === session?.user.id && <div role="group" aria-label="Confirm pack deletion" style={{ marginTop: 16 }}>
        <p>Delete “{pack.title}” permanently? Its order and notes will be removed. Shared source records and other people’s copies will remain.</p>
        <button className="btn" disabled={saving || conflict} onClick={deletePack}>{saving ? "Deleting…" : "Permanently delete this pack"}</button>{" "}
        <button className="chip" disabled={saving} onClick={() => { setDeleteRevision(null); setError(""); setConflict(false); }}>Keep pack</button>
      </div>}
      {!pack.is_public && <p>Only your signed-in account can open this pack. Source links themselves remain public.</p>}
    </section>}
    {!id && !loading && <section aria-label="Available source packs">
      <h2>Public packs and your private packs</h2>
      {!packs.length && !error && <p>No packs yet. Create the first source map for your topic.</p>}
      {packs.filter(p => p.is_public || p.owner_id === session?.user.id).map(p => <article className="panel" key={p.id}><h3><a href={`/packs/${p.id}`}>{p.title}</a> <span className="tag">{p.is_public ? "Public" : "Private"}</span></h3><p>{p.description}</p><small>{p.category}</small></article>)}
    </section>}
    {!session && authReady && <p><a href="/sources">Sign in on the source shelf</a> to create a pack or save your own copy.</p>}
    {session && editing && <form className="panel" onSubmit={save}>
      <fieldset disabled={saving} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <h2>{editRevision !== null ? "Edit your source pack" : id ? "Save your own copy" : "Create a ranked source pack"}</h2>
      <label style={style}>Title<input className="claim-input" required maxLength={120} value={title} onChange={e => setTitle(e.target.value)} /></label>
      <label style={style}>Description<textarea className="claim-input" maxLength={2000} value={description} onChange={e => setDescription(e.target.value)} /></label>
      <label style={style}>Topic or category<input className="claim-input" required maxLength={80} placeholder="e.g. OAuth security" value={category} onChange={e => setCategory(e.target.value)} /></label>
      <label style={style}>Tags (comma-separated)<input className="claim-input" value={tags} onChange={e => setTags(e.target.value)} /></label>
      <label style={style}><input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} /> Publish this pack for anyone to read and copy</label>
      <p className="panel-sub">{editRevision !== null ? "Saving updates this pack’s shared address. Existing copies remain independent." : "Saving creates an independent pack."} Private packs are visible only to your account; their linked sources are still public.</p>
      <h3>Your ranking ({entries.length}/50)</h3>
      <ol style={{ paddingLeft: 24 }}>{entries.map((entry, i) => <li key={entry.source.id} style={{ marginBottom: 16 }}>
        <strong>{entry.source.title}</strong>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0" }}>
          <button type="button" className="chip" disabled={i === 0} aria-label={`Move ${entry.source.title} up`} onClick={() => move(i, -1)}>↑ Up</button>
          <button type="button" className="chip" disabled={i === entries.length - 1} aria-label={`Move ${entry.source.title} down`} onClick={() => move(i, 1)}>↓ Down</button>
          <button type="button" className="chip" onClick={() => setEntries(entries.filter(e => e.source.id !== entry.source.id))}>Remove</button>
        </div>
        <label>Why this source?<textarea className="claim-input" maxLength={1000} value={entry.note} onChange={e => setEntries(current => current.map(item => item.source.id === entry.source.id ? { ...item, note: e.target.value } : item))} /></label>
      </li>)}</ol>
      <label style={style}>Find links on the source shelf<input className="claim-input" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search title or excerpt" /></label>
      <p className="panel-sub">Showing up to 100 shelf results. Narrow the search, or <a href="/sources">contribute a missing link</a>.</p>
      <div style={{ maxHeight: 300, overflowY: "auto", marginBottom: 20 }}>{sources.map(source => <div key={source.id} style={{ marginBottom: 10 }}>
        <button type="button" className="chip" disabled={entries.length >= 50 || entries.some(e => e.source.id === source.id)} onClick={() => setEntries(current => [...current, { source, note: "" }])}>Add</button>{" "}{source.title}
      </div>)}</div>
      <button className="btn" disabled={saving || entries.length === 0 || conflict}>{saving ? "Saving…" : editRevision !== null ? "Save changes" : "Save source pack"}</button>{" "}
      {id && <button type="button" className="chip" disabled={saving} onClick={discardDraft}>Discard {editRevision !== null ? "changes" : "copy"}</button>}
      </fieldset>
    </form>}
  </>;
}
