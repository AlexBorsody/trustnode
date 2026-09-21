"use client";

import { useEffect, useState } from "react";
import type { Verification } from "@/trustnode/pipeline";
import { PIPELINE_VERSION } from "@/trustnode/version";

const DEMOS = [
  "This configuration requires OAuth PKCE",
  "PKCE is only for mobile apps",
  "The implicit flow is fine for single-page apps",
];

const STANCE_CLASS: Record<string, string> = {
  supports: "stance-supports",
  contradicts: "stance-contradicts",
  qualifies: "stance-qualifies",
  unrelated: "stance-unrelated",
};

export default function VerifyPage() {
  const [claim, setClaim] = useState(DEMOS[0]);
  const [result, setResult] = useState<Verification | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const linkedClaim = new URL(window.location.href).searchParams.get("claim");
    if (linkedClaim) setClaim(linkedClaim.slice(0, 500));
  }, []);

  async function run(text: string) {
    const c = text.trim();
    if (!c) {
      setError("Enter a claim to verify.");
      setResult(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claim: c }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "verification failed");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "verification failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="meta-line">
        CLAIM VERIFICATION <b>v{PIPELINE_VERSION}</b> · DETERMINISTIC · NO MODEL GRADES ITS OWN HOMEWORK
      </div>
      <h1 className="page-title">Verify a claim</h1>
      <p className="page-sub">
        Paste a claim to inspect its sources,
        supporting evidence, contradictions, and provenance — with confidence derived
        transparently. The current verification corpus covers OAuth/PKCE; other topics may have no analyzed evidence.
      </p>

      <div className="panel">
        <textarea
          className="claim-input"
          rows={3}
          value={claim}
          aria-label="Claim to verify"
          aria-describedby={error ? "claim-error" : undefined}
          aria-invalid={Boolean(error)}
          onChange={(e) => {
            setClaim(e.target.value);
            setError(null);
          }}
          placeholder="Paste an AI-generated claim…"
        />
        <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button className="btn" onClick={() => run(claim)} disabled={loading}>
            {loading ? "Verifying…" : "Verify →"}
          </button>
          <span style={{ color: "var(--text-faint)", fontSize: 13 }}>try:</span>
          {DEMOS.map((d) => (
            <button
              key={d}
              className="chip"
              onClick={() => {
                setClaim(d);
                run(d);
              }}
            >
              {d.length > 42 ? d.slice(0, 42) + "…" : d}
            </button>
          ))}
        </div>
        {error && <p id="claim-error" role="alert" style={{ color: "#e5484d", marginTop: 10 }}>{error}</p>}
      </div>

      {result && (
        <>
          <div className="panel">
            <h2>
              Confidence: {result.confidence.value}/100{" "}
              <span className={`tag ${result.confidence.value >= 50 ? "" : "na"}`}>
                {result.confidence.level}
              </span>
            </h2>
            <p className="panel-sub">Claim: “{result.claim}”</p>
            <div className="formula">{result.confidence.derivation}</div>
          </div>

          {result.conflicts.length > 0 && (
            <div className="panel">
              <h2>Conflicts detected</h2>
              {result.conflicts.map((c, i) => (
                <div className="gate" key={i}>
                  <code>{c.type}</code>
                  <p style={{ margin: "6px 0 0", color: "var(--text-dim)", fontSize: 13 }}>{c.detail}</p>
                </div>
              ))}
            </div>
          )}

          <h2 style={{ fontSize: 18, margin: "28px 0 12px" }}>
            Evidence chain — {result.sources.length} sources retrieved
          </h2>
          {result.sources.map((s) => (
            <div className="panel" key={s.id}>
              <h2 style={{ fontSize: 15 }}>
                <a href={s.url} target="_blank" rel="noreferrer" style={{ color: "var(--text)" }}>
                  {s.title}
                </a>{" "}
                <span className={STANCE_CLASS[s.stance]}>{s.stance}</span>{" "}
                {s.origin === "community" && <span className="tag">community source</span>}{" "}
                {s.freshness !== "current" && <span className="tag na">{s.freshness}</span>}
              </h2>
              <p className="panel-sub" style={{ marginBottom: 6 }}>
                {s.publisher} · {s.freshness_detail}
              </p>
              {s.quote && (
                <p style={{ borderLeft: "3px solid var(--accent)", paddingLeft: 12, color: "var(--text-dim)" }}>
                  “{s.quote}”
                  {s.stance_note && (
                    <span style={{ display: "block", fontSize: 13, color: "var(--text-faint)", marginTop: 4 }}>
                      {s.stance_note}
                    </span>
                  )}
                </p>
              )}
              <div className="num" style={{ fontSize: 12.5, color: "var(--text-dim)" }}>
                earned trust <b>{s.trust.earned}/10</b> ({s.trust.earned_rationale}) · community{" "}
                {s.trust.community}/10 ({s.trust.community_votes} votes, displayed only) ·{" "}
                <span style={{ color: "var(--text-faint)" }}>{s.match_explain}</span>
              </div>
            </div>
          ))}

          <p style={{ color: "var(--text-faint)", fontSize: 12.5, marginTop: 16 }}>
            {result.note} Pipeline {result.pipeline_version}.
          </p>
        </>
      )}
    </>
  );
}

