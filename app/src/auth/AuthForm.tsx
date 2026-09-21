"use client";
import { useEffect, useState } from "react";
import { authClient } from "./client";
import { useAuth } from "./useAuth";
import { safeReturnTo } from "./returnTo";

type Provider = "google" | "azure";
const names: Record<Provider, string> = { google: "Google", azure: "Microsoft" };
export default function AuthForm({ signup = false }: { signup?: boolean }) {
  const { session, ready, error: sessionError, configured } = useAuth();
  const [next, setNext] = useState("/packs");
  const [busy, setBusy] = useState<Provider | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [signupEnabled, setSignupEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => { setNext(safeReturnTo(new URLSearchParams(window.location.search).get("next"))); }, []);
  useEffect(() => {
    const ctrl = new AbortController(); setLoading(true); setError(""); setProviders([]);
    (async () => {
      try {
        const response = await fetch("/api/auth/providers", { signal: ctrl.signal, cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Sign-in is unavailable.");
        if (!ctrl.signal.aborted) {
          setProviders((data.providers ?? []).filter((p: string) => p === "google" || p === "azure"));
          setSignupEnabled(data.signupEnabled === true);
        }
      } catch (e) { if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : "Could not check sign-in availability."); }
      finally { if (!ctrl.signal.aborted) setLoading(false); }
    })();
    return () => ctrl.abort();
  }, [reload]);
  async function signIn(provider: Provider) {
    if (!configured || busy || !providers.includes(provider)) return;
    setBusy(provider); setError("");
    try {
      const { error } = await authClient().auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
          ...(provider === "azure" ? { scopes: "email" } : {}),
        },
      });
      if (error) throw new Error(`Could not start ${names[provider]} sign-in. Try again.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not start sign-in. Check your connection and try again."); }
    finally { setBusy(null); }
  }
  return <>
    <div className="meta-line">YOUR RESEARCH · YOUR SOURCE PACKS</div>
    <h1 className="page-title">{signup ? "Join TrustNode" : "Sign in to TrustNode"}</h1>
    <p className="page-sub">Use your existing identity to contribute sources and curate packs. No separate TrustNode password.</p>
    {!ready && <p role="status">Checking your session…</p>}
    {sessionError && <p role="alert">{sessionError}</p>}
    {session ? <section className="panel"><h2>You’re signed in</h2><p>{session.user.email}</p><a className="btn" href={next}>Continue to your research</a> · <a href="/account">Manage account or sign out</a></section> : ready && <section className="panel" style={{ maxWidth: 560 }}>
      {loading && <p role="status">Checking available sign-in providers…</p>}
      {error && <p role="alert">{error} <button className="chip" onClick={() => setReload(n => n + 1)}>Retry</button></p>}
      {!loading && !error && (!configured || !providers.length) && <p role="status">SSO sign-in is being configured. You can still <a href="/explore">explore public sources</a>.</p>}
      {configured && providers.length > 0 && <>
        <p>{signupEnabled ? "Your account is created automatically the first time you sign in. Returning users go straight back to their account." : "Sign in with an existing account. New account creation is not enabled yet."}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{providers.map(provider => <button key={provider} className="btn" disabled={!!busy} onClick={() => signIn(provider)}>{busy === provider ? "Connecting…" : `Continue with ${names[provider]}`}</button>)}</div>
        <p className="panel-sub" style={{ marginTop: 16 }}>Public pack attribution uses your account ID. Your email remains private.</p>
      </>}
    </section>}
  </>;
}
