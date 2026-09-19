"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient, type SupabaseClient, type Session } from "@supabase/supabase-js";

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPA_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const configured = SUPA_URL.startsWith("http") && SUPA_ANON.length > 20;

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

let browserClient: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (!browserClient) browserClient = createClient(SUPA_URL, SUPA_ANON);
  return browserClient;
}

const inputStyle: React.CSSProperties = {
  width: "100%", background: "#0d1117", border: "1px solid var(--border)",
  borderRadius: 8, color: "var(--text)", padding: "10px 12px",
  fontSize: 14, fontFamily: "inherit", marginBottom: 10,
};

export default function SourcesPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [authMsg, setAuthMsg] = useState<string | null>(null);
  const [sources, setSources] = useState<CommonsSource[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [q, setQ] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [loading, setLoading] = useState(false);
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
    sb().auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = sb().auth.onAuthStateChange((_e, s) => setSession(s));
    sb().from("tn_categories").select("slug,name").order("name")
      .then(({ data }) => setCategories((data ?? []) as Category[]));
    return () => sub.subscription.unsubscribe();
  }, []);

  const load = useCallback(async () => {
    const sp = new URLSearchParams({ limit: "100" });
    if (q.trim()) sp.set("q", q.trim());
    if (catFilter) sp.set("category", catFilter);
    const res = await fetch(`/api/sources?${sp}`);
    const data = await res.json();
    if (res.ok) setSources(data.sources ?? []);
  }, [q, catFilter]);

  useEffect(() => { if (configured) load(); }, [load]);

  async function sendMagicLink() {
    setAuthMsg(null);
    const em = email.trim();
    if (!em) return;
    const { error } = await sb().auth.signInWithOtp({
      email: em,
      options: { emailRedirectTo: `${window.location.origin}/sources` },
    });
    setAuthMsg(error ? error.message : "Check your email for the sign-in link.");
  }

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
    const data = await authed("/api/sources", JSON.stringify({
      url: linkUrl, title: linkTitle, category: linkCat, tags: linkTags, description: linkDesc,
    }));
    setLoading(false);
    if (data) {
      setMsg(`Link shelved (${data.status}).`);
      setLinkUrl(""); setLinkTitle(""); setLinkTags(""); setLinkDesc("");
      load();
    }
  }

  async function submitUpload() {
    setMsg(null);
    if (!upFile) { setMsg("Choose a file first."); return; }
    setLoading(true);
    const form = new FormData();
    form.set("file", upFile);
    form.set("title", upTitle);
    form.set("category", upCat);
    form.set("tags", upTags);
    form.set("description", upDesc);
    const data = await authed("/api/sources/upload", form, true);
    setLoading(false);
    if (data) {
      setMsg(`File shelved (${data.status}).`);
      setUpFile(null); setUpTitle(""); setUpTags(""); setUpDesc("");
      load();
    }
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

      {msg && <div className="panel"><p style={{ margin: 0 }}>{msg}</p></div>}

      <div className="panel">
        <h2>{session ? "Signed in" : "Sign in to contribute"}</h2>
        {session ? (
          <p className="panel-sub" style={{ marginBottom: 0 }}>
            {session.user.email}{" "}
            <button className="chip" onClick={() => sb().auth.signOut()}>sign out</button>
          </p>
        ) : (
          <>
            <p className="panel-sub">One-click email magic link. No password.</p>
            <div style={{ display: "flex", gap: 8 }}>
              <input className="claim-input" style={{ marginBottom: 0 }} placeholder="you@example.com"
                value={email} onChange={(e) => setEmail(e.target.value)} />
              <button className="btn" onClick={sendMagicLink}>Send link</button>
            </div>
            {authMsg && <p className="panel-sub" style={{ marginTop: 8 }}>{authMsg}</p>}
          </>
        )}
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
            <input style={inputStyle} type="file"
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
          value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="claim-input" style={{ marginBottom: 0, maxWidth: 200 }} value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </select>
      </div>

      {sources.length === 0 && (
        <div className="panel"><p className="panel-sub" style={{ margin: 0 }}>The shelf is empty. Be the first to shelve a source.</p></div>
      )}
      {sources.map((s) => (
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
    </>
  );
}
