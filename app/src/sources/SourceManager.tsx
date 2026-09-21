"use client";
import { useEffect, useRef, useState } from "react";
export type EditableSource = { id: string; title: string; excerpt: string | null; kind: "file" | "link"; owner_id: string | null };
export default function SourceManager({ source, token, onClose, onSaved }: {
  source: EditableSource; token: string; onClose: () => void; onSaved: (message: string) => void;
}) {
  const [title, setTitle] = useState(source.title);
  const [description, setDescription] = useState(source.excerpt ?? "");
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function save(remove = false) {
    if (busy) return;
    const ctrl = new AbortController(); request.current = ctrl;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/sources/${source.id}`, {
        method: remove ? "DELETE" : "PATCH", signal: ctrl.signal,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        ...(remove ? {} : { body: JSON.stringify({ title, description }) }),
      });
      const data = await response.json();
      if (ctrl.signal.aborted) return;
      if (!response.ok) throw new Error(data.error ?? "Could not update this source.");
      onSaved(remove ? data.warning ?? "Source deleted." : "Source details saved.");
    } catch (e) { if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : "Could not update this source. Your draft is still here."); }
    finally { if (!ctrl.signal.aborted) setBusy(false); }
  }
  return <section id="source-editor" className="panel" aria-label="Manage your source">
    <h2>Manage your source</h2>
    <p>Editing “{source.title}”. Source records are public and shared by every pack that uses them. Changes to these details appear everywhere; pack ranks and notes stay independent.</p>
    {error && <p role="alert">{error}</p>}
    {deleting ? <>
      <p>Delete this source permanently{source.kind === "file" ? " and remove its uploaded file" : ""}? A source used by a pack cannot be deleted.</p>
      <button className="btn" disabled={busy} onClick={() => save(true)}>{busy ? "Deleting…" : "Permanently delete source"}</button>{" "}
      <button className="chip" disabled={busy} onClick={() => { setDeleting(false); setError(""); }}>Keep source</button>
    </> : <form onSubmit={e => { e.preventDefault(); void save(); }}>
      <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }}>
        <label style={{ display: "block", marginBottom: 12 }}>Source title<input className="claim-input" required maxLength={300} value={title} onChange={e => setTitle(e.target.value)} /></label>
        <label style={{ display: "block", marginBottom: 12 }}>Source description<textarea className="claim-input" maxLength={4000} value={description} onChange={e => setDescription(e.target.value)} /></label>
        <p className="panel-sub">The description is searchable context. Extracted file text is retained separately. The original URL, category and tags remain unchanged.</p>
        <button className="btn" disabled={busy || !title.trim()}>{busy ? "Saving…" : "Save source details"}</button>{" "}
        <button type="button" className="chip" onClick={() => setDeleting(true)}>Delete source</button>{" "}
        <button type="button" className="chip" onClick={onClose}>Discard changes</button>
      </fieldset>
    </form>}
  </section>;
}
