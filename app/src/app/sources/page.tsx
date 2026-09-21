"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { authClient as sb, authConfigured as configured } from "@/auth/client";
import { useAuth } from "@/auth/useAuth";

interface Category { slug: string; name: string }
interface Tag { slug: string; label: string }
interface CommonsSource {
  id: string;
  kind: "file" | "link";
  title: string;
  url: string | null;
  file_url: string | null;
  file_name: string | null;
  status: string;
  excerpt: string | null;
  created_at: string;
  category: Category | null;
  tags: Tag[];
}

const inputStyle: React.CSSProperties = {
  width: "100%", background: "#0d1117", border: "1px solid var(--border)",
  borderRadius: 8, color: "var(--text)", padding: "10px 12px",
  fontSize: 14, fontFamily: "inherit", marginBottom: 10,
};

export default function SourcesPage() {
  const { session, ready: authReady, error: authError } = useAuth();
  const [sources, setSources] = useState<CommonsSource[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [q, setQ] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const pageSize = 25;
  const fileInput = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);
  const [shelfError, setShelfError] = useState<string | null>(null);
  const [shelfLoading, setShelfLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // link form
  const [linkUrl, setLinkUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [linkCat, setLinkCat] = useState("general");
  const [linkTags, setLinkTags] = useState("");
  const [linkDesc, setLinkDesc] = useState("");
  // upload form
  const [upFile, setUpFile] = useState<File | null>(null);
  const [upTitle, setUpTitle] = useState("");
  const [upCat, setUpCat] = useState("general");
  const [upTags, setUpTags] = useState("");
  const [upDesc, setUpDesc] = useState("");

  useEffect(() => {
    if (!configured) return;
    sb().from("tn_categories").select("slug,name").order("name")
      .then(({ data }) => setCategories((data ?? []) as Category[]));
  }, []);

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setShelfLoading(true);
    setShelfError(null);
    const sp = new URLSearchParams({ limit: String(pageSize), offset: String(page * pageSize) });
    if (q.trim()) sp.set("q", q.trim());
    if (catFilter) sp.set("category", catFilter);
    try {
      const res = await fetch(`/api/sources?${sp}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load the source shelf.");
      if (currentRequest === requestId.current) {
        setSources(data.sources ?? []);
        setTotal(data.total ?? 0);
      }
    } catch (error) {
      if (currentRequest === requestId.current) {
        setSources([]);
        setShelfError(error instanceof Error ? error.message : "Could not load sources. Try again.");
      }
    } finally {
      if (currentRequest === requestId.current) setShelfLoading(false);
    }
  }, [q, catFilter, page]);

  useEffect(() => {
    if (configured) void load();
    return () => { requestId.current += 1; };
  }, [load]);

  async function authed(path: string, body: BodyInit, isForm = false) {
    const token = session?.access_token;
    if (!token) { setMsg("Sign in first."); return null; }
    const res = await fetch(path, {
      method: "POST",
      headers: isForm ? { Authorization: `Bearer ${token}` } : { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body,
    });
    const data = await res.json();
    if (!res.ok) { setMsg(data.error ?? "failed"); return null; }
    return data;
  }

  async function submitLink() {
    setMsg(null); setLoading(true);
    try {
      const data = await authed("/api/sources", JSON.stringify({
        url: linkUrl, title: linkTitle, category: linkCat, tags: linkTags, description: linkDesc,
      }));
      if (data) {
        setMsg(`Link shelved (${data.status}).`);
        setLinkUrl(""); setLinkTitle(""); setLinkTags(""); setLinkDesc("");
        if (page === 0) void load(); else setPage(0);
      }
    } catch {
      setMsg("Could not submit the link. Your entries are still here; try again.");
    } finally { setLoading(false); }
  }

  async function submitUpload() {
    setMsg(null);
    if (!upFile) { setMsg("Choose a file first."); return; }
    setLoading(true);
    try {
      const form = new FormData();
      form.set("file", upFile);
      form.set("title", upTitle);
      form.set("category", upCat);
      form.set("tags", upTags);
      form.set("description", upDesc);
      const data = await authed("/api/sources/upload", form, true);
      if (data) {
        setMsg(`File shelved (${data.status}).`);
        setUpFile(null); setUpTitle(""); setUpTags(""); setUpDesc("");
        if (fileInput.current) fileInput.current.value = "";
        if (page === 0) void load(); else setPage(0);
      }
    } catch {
      setMsg("Could not upload the file. Your entries are still here; try again.");
    } finally { setLoading(false); }
  }

  if (!configured) {
    return (
      <>
        <div className="meta-line">SOURCE COMMONS · NOT CONFIGURED</div>
        <h1 className="page-title">The commons shelf</h1>
        <div className="panel"><p>The source commons database isn't connected yet. Check back soon.</p></div>
      </>
    );
  }

  return (
    <>
      <div className="meta-line">
        SOURCE COMMONS <b>v0.1</b> · FILES + LINKS · CATEGORIES + TAGS · PUBLIC READ, SIGNED-IN WRITE
      </div>
      <h1 className="page-title">The commons shelf</h1>
      <p className="page-sub">
        Add your own sources — upload files or paste links — grouped by category and tagged.
        Everything shelved here joins TrustNode's retrieval. Seeds are starting points, not thrones.
      </p>

      {msg && <div className="panel" role="status"><p style={{ margin: 0 }}>{msg}</p></div>}

      <div className="panel">
        <h2>{session ? "Your contributions" : "Contribute to the source commons"}</h2>
        {!authReady ? <p role="status">Checking your session…</p> : session
          ? <p>Signed in as {session.user.email}. <a href="/account">Manage account or sign out</a></p>
          : <p><a className="btn" href="/login?next=%2Fsources">Sign in</a> · <a href="/signup?next=%2Fsources">Create account</a> to contribute links or files.</p>}
        {authError && <p role="alert">{authError}</p>}
      </div>

      {session && (
        <>
          <div className="panel">
            <h2>Shelve a link</h2>
            <input style={inputStyle} placeholder="https://…" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
            <input style={inputStyle} placeholder="Title (optional — pulled from the page)" value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} />
            <div style={{ display: "flex", gap: 8 }}>
              <select style={{ ...inputStyle, flex: 1 }} value={linkCat} onChange={(e) => setLinkCat(e.target.value)}>
                {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
              </select>
              <input style={{ ...inputStyle, flex: 2 }} placeholder="tags, comma, separated" value={linkTags} onChange={(e) => setLinkTags(e.target.value)} />
            </div>
            <textarea className="claim-input" rows={2} placeholder="Why this source matters (optional — becomes its excerpt)"
              value={linkDesc} onChange={(e) => setLinkDesc(e.target.value)} />
            <button className="btn" disabled={loading || !linkUrl.trim()} onClick={submitLink}>
              {loading ? "Shelving…" : "Shelve link"}
            </button>
          </div>

          <div className="panel">
            <h2>Upload a file</h2>
            <p className="panel-sub">PDF, text, markdown, HTML, CSV, JSON — max 25 MB.</p>
            <input ref={fileInput} style={inputStyle} type="file"
              accept=".pdf,.txt,.md,.markdown,.html,.csv,.json"
              onChange={(e) => setUpFile(e.target.files?.[0] ?? null)} />
            <input style={inputStyle} placeholder="Title (optional — defaults to filename)" value={upTitle} onChange={(e) => setUpTitle(e.target.value)} />
            <div style={{ display: "flex", gap: 8 }}>
              <select style={{ ...inputStyle, flex: 1 }} value={upCat} onChange={(e) => setUpCat(e.target.value)}>
                {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
              </select>
              <input style={{ ...inputStyle, flex: 2 }} placeholder="tags, comma, separated" value={upTags} onChange={(e) => setUpTags(e.target.value)} />
            </div>
            <textarea className="claim-input" rows={2} placeholder="Describe the contents (becomes its searchable excerpt)"
              value={upDesc} onChange={(e) => setUpDesc(e.target.value)} />
            <button className="btn" disabled={loading || !upFile} onClick={submitUpload}>
              {loading ? "Uploading…" : "Upload file"}
            </button>
          </div>
        </>
      )}

      <h2 style={{ fontSize: 18, margin: "28px 0 12px" }}>On the shelf</h2>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input className="claim-input" style={{ marginBottom: 0 }} placeholder="Search the shelf…"
          aria-label="Search the shelf" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
        <select className="claim-input" style={{ marginBottom: 0, maxWidth: 200 }} value={catFilter}
          aria-label="Filter by category" onChange={(e) => { setCatFilter(e.target.value); setPage(0); }}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </select>
      </div>

      <p className="panel-sub">Found useful links? <a href="/packs">Organize them into a source pack →</a></p>
      {shelfLoading && <p role="status">Loading sources…</p>}
      {shelfError && <div className="panel" role="alert"><p>{shelfError}</p><button className="chip" onClick={() => void load()}>Retry</button></div>}
      {!shelfLoading && !shelfError && sources.length === 0 && (
        <div className="panel"><p className="panel-sub" style={{ margin: 0 }}>{q.trim() || catFilter ? "No sources match these filters." : "The shelf is empty. Be the first to shelve a source."}</p></div>
      )}
      {!shelfLoading && !shelfError && sources.map((s) => (
        <div className="panel" key={s.id}>
          <h2 style={{ fontSize: 15 }}>
            <a href={s.kind === "link" ? (s.url ?? "#") : (s.file_url ?? "#")} target="_blank" rel="noreferrer"
              style={{ color: "var(--text)" }}>
              {s.title}
            </a>{" "}
            <span className="tag">{s.kind}</span>{" "}
            {s.status !== "ready" && <span className="tag na">{s.status}</span>}
          </h2>
          <p className="panel-sub" style={{ marginBottom: 6 }}>
            {s.category?.name ?? "Uncategorized"}
            {s.tags.length > 0 && <> · {s.tags.map((t) => `#${t.slug}`).join(" ")}</>}
            {" · "}{new Date(s.created_at).toLocaleDateString()}
          </p>
          {s.excerpt && (
            <p style={{ color: "var(--text-dim)", fontSize: 13.5, margin: "0 0 4px" }}>
              {s.excerpt.slice(0, 280)}{s.excerpt.length > 280 ? "…" : ""}
            </p>
          )}
        </div>
      ))}
      {!shelfLoading && !shelfError && (total > 0 || page > 0) && (
        <nav aria-label="Source shelf pages" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <button className="chip" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</button>
          <span role="status">{sources.length ? `${page * pageSize + 1}–${page * pageSize + sources.length} of ${total} sources` : "No sources on this page"}</span>
          <button className="chip" disabled={(page + 1) * pageSize >= total} onClick={() => setPage(p => p + 1)}>Next</button>
        </nav>
      )}
    </>
  );
}
