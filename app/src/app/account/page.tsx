"use client";
import { useEffect, useState } from "react";
import { authClient } from "@/auth/client";
import { useAuth } from "@/auth/useAuth";
import { safeReturnTo } from "@/auth/returnTo";

export default function AccountPage() {
  const { session, ready, error: sessionError, configured } = useAuth();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [next, setNext] = useState("/packs");
  useEffect(() => { setNext(safeReturnTo(new URLSearchParams(window.location.search).get("next"))); }, []);
  useEffect(() => {
    const displayName = session?.user.user_metadata?.display_name ?? session?.user.user_metadata?.full_name ?? session?.user.user_metadata?.name;
    setName(typeof displayName === "string" ? displayName.slice(0, 60) : "");
    setError(""); setMessage("");
  }, [session?.user.id, session?.user.user_metadata?.display_name]);
  const onboarding = session?.user.user_metadata?.onboarded !== true;
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!session || busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const { error } = await authClient().auth.updateUser({ data: { display_name: name.trim(), onboarded: true } });
      if (error) throw new Error("Could not save your account details. Try again.");
      if (onboarding) window.location.assign(next);
      else setMessage("Account details saved.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save account details."); }
    finally { setBusy(false); }
  }
  async function signOut() {
    setBusy(true); setError("");
    try {
      const { error } = await authClient().auth.signOut({ scope: "local" });
      if (error) throw new Error("Could not sign out. Check your connection and try again.");
      window.location.replace("/login");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not sign out. Try again."); }
    finally { setBusy(false); }
  }
  return <>
    <div className="meta-line">YOUR ACCOUNT</div>
    <h1 className="page-title">{session && onboarding ? "Welcome to TrustNode" : "My account"}</h1>
    {!ready && <p role="status">Loading your account…</p>}
    {!configured && <p role="alert">Account access is not configured yet.</p>}
    {sessionError && <p role="alert">{sessionError}</p>}
    {ready && !session && <section className="panel"><p>Sign in to manage your account and private packs.</p><a className="btn" href="/login">Sign in</a> · <a href="/signup">Create account</a></section>}
    {session && <>
      <form className="panel" onSubmit={save} style={{ maxWidth: 640 }}>
        <p>Signed in as <strong>{session.user.email}</strong>.</p>
        {onboarding && <p>Your account is ready. Start by contributing a source or curating a pack. New packs are private until you choose to publish them.</p>}
        <label>Your name (optional)<input className="claim-input" autoComplete="name" maxLength={60} value={name} disabled={busy} onChange={e => setName(e.target.value)} /></label>
        <p className="panel-sub" style={{ marginTop: 12 }}>This name personalizes your account. Public attribution currently uses your account ID; your email is not shown on packs.</p>
        <p className="panel-sub" style={{ overflowWrap: "anywhere" }}>Account ID: {session.user.id}</p>
        {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
        <button className="btn" disabled={busy}>{busy ? "Working…" : onboarding ? "Start researching" : "Save account details"}</button>{" "}
        <button className="chip" type="button" disabled={busy} onClick={signOut}>Sign out of this browser</button>
      </form>
      <div className="score-grid">
        <section className="panel"><h2>Contribute a source</h2><p>Add a link and explain why it matters.</p><a href="/sources">Open the source shelf →</a></section>
        <section className="panel"><h2>Curate a pack</h2><p>Order sources, add notes, and keep your research private or share it.</p><a href="/packs">Open source packs →</a></section>
        <section className="panel"><h2>Explore evidence</h2><p>Inspect the factors behind source order and claim confidence.</p><a href="/explore">Explore sources →</a></section>
      </div>
    </>}
  </>;
}
