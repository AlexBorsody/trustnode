"use client";
import { useEffect, useRef, useState } from "react";
import { validateBundle, type RunBundle, type RunStatus, type Artifact } from "./model";
import type { FrozenInput } from "../trustnode/runs/artifact";
export class TrustRequestError extends Error { constructor(message: string, public readonly status: number) { super(message); } }
export async function requestJson<T>(url: string, token?: string, signal?: AbortSignal, body?: unknown, unavailable = "Trust ranking is unavailable right now. Try again later."): Promise<T> {
  const response = await fetch(url, { method: body === undefined ? "GET" : "POST", signal, cache: "no-store",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok) throw new TrustRequestError(response.status === 503 ? unavailable : result.error ?? "Trust request failed. Try again.", response.status);
  return result as T;
}
export async function loadBundle(runId: string, status: RunStatus, token: string | undefined, signal: AbortSignal): Promise<RunBundle> {
  const root = `/api/trust/runs/${encodeURIComponent(runId)}/export`;
  const inputResponse = await fetch(`${root}?part=input`, { signal, cache: "no-store", headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!inputResponse.ok) { const error = await inputResponse.json(); throw new TrustRequestError(error.error ?? "Run input is unavailable.", inputResponse.status); }
  const inputText = await inputResponse.text();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(inputText));
  const hash = [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, "0")).join("");
  if (hash !== status.input_hash) throw new Error("Frozen input hash does not match this run.");
  const artifact = await requestJson<Artifact>(`${root}?part=raw`, token, signal);
  return validateBundle(runId, status, JSON.parse(inputText) as FrozenInput, artifact);
}
/** Bounded polling; callers remount this hook on run/account changes. */
export function useRun(runId: string, token?: string) {
  const [status, setStatus] = useState<RunStatus | null>(null), [bundle, setBundle] = useState<RunBundle | null>(null);
  const [error, setError] = useState(""), [paused, setPaused] = useState(false), [refresh, setRefresh] = useState(0);
  const active = useRef<AbortController | null>(null);
  const reload = () => { active.current?.abort(); setBundle(null); setStatus(null); setError(""); setPaused(false); setRefresh(n => n + 1); };
  useEffect(() => {
    const ctrl = new AbortController(); active.current = ctrl; let timer: ReturnType<typeof setTimeout> | undefined; let attempts = 0;
    async function poll() {
      try {
        const next = await requestJson<RunStatus>(`/api/trust/runs/${encodeURIComponent(runId)}`, token, ctrl.signal);
        if (ctrl.signal.aborted) return;
        if (next.run_id !== runId) throw new Error("Unexpected run response.");
        setStatus(next);
        if (next.state === "completed") {
          const saved = await loadBundle(runId, next, token, ctrl.signal);
          if (!ctrl.signal.aborted) setBundle(saved);
        } else if (next.state !== "failed") {
          if (++attempts < 20) timer = setTimeout(poll, 3000); else setPaused(true);
        }
      } catch (e) { if (!ctrl.signal.aborted) { setBundle(null); setStatus(null); setError(e instanceof Error ? e.message : "Could not load this run."); } }
    }
    setBundle(null); setStatus(null); setError(""); setPaused(false); void poll();
    // Revalidate current access whenever the user returns to the page.
    const focus = () => { if (document.visibilityState === "visible") reload(); };
    window.addEventListener("focus", focus); document.addEventListener("visibilitychange", focus);
    return () => { ctrl.abort(); clearTimeout(timer); window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", focus); };
  }, [runId, token, refresh]);
  return { status, bundle, error, paused, reload };
}
