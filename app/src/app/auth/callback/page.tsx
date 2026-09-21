"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/auth/useAuth";
import { safeReturnTo } from "@/auth/returnTo";
export default function AuthCallback() {
  const { session, ready, error } = useAuth();
  const [linkError, setLinkError] = useState(false);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.slice(1));
    if (query.has("error") || hash.has("error")) {
      setLinkError(true);
      window.history.replaceState(null, "", "/auth/callback");
    }
  }, []);
  useEffect(() => {
    if (!ready || !session || linkError || error) return;
    const next = safeReturnTo(new URLSearchParams(window.location.search).get("next"));
    window.location.replace(session.user.user_metadata?.onboarded === true ? next : `/account?welcome=1&next=${encodeURIComponent(next)}`);
  }, [session, ready, linkError, error]);
  return <section className="panel"><h1 className="page-title">{!linkError && !error && (!ready || session) ? "Completing sign-in…" : "Sign-in couldn’t be completed"}</h1>
    {!linkError && !error && (!ready || session) ? <p role="status">Restoring your account securely.</p> : <><p role="alert">{error || "The sign-in was cancelled, expired, or started in another browser. Please try again."}</p><a className="btn" href="/login">Back to sign in</a></>}
  </section>;
}
