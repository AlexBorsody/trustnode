"use client";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { authClient, authConfigured } from "./client";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!authConfigured);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!authConfigured) return;
    const client = authClient(); let active = true;
    const { data } = client.auth.onAuthStateChange((event, next) => {
      if (active) { setSession(next); setReady(true); if (event !== "INITIAL_SESSION") setError(""); }
    });
    client.auth.initialize().then(async ({ error: initializationError }) => {
      const { data, error } = await client.auth.getSession();
      if (!active) return;
      setSession(data.session); setReady(true);
      if (error || initializationError) setError("Could not restore your session. Sign in again.");
    }).catch(() => { if (active) { setReady(true); setError("Could not restore your session. Check your connection and sign in again."); } });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);
  return { session, ready, error, configured: authConfigured };
}
