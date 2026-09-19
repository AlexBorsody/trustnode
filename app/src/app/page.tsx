export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <>
      <div className="meta-line">
        PROTOTYPE <b>v0.1.0</b> · DETERMINISTIC PIPELINE · SEEDED CORPUS (OAUTH/PKCE)
      </div>
      <h1 className="page-title">TrustNode</h1>
      <p className="page-sub">
        AI gives convincing answers. TrustNode shows where they came from, whether the
        sources actually support them, and how much confidence the evidence earns.
      </p>

      <div className="panel">
        <h2>Answer → Claim → Source → Evidence → Confidence</h2>
        <p className="panel-sub" style={{ marginBottom: 8 }}>
          TrustNode sits between an AI application and its information sources and makes
          provenance visible. It is not another chatbot, and it is not an AI fact-checker
          that asks a second model whether the first one was right. Its value comes from
          grounding claims against identifiable sources and exposing the evidence chain.
        </p>
        <div className="formula">verify(claim) = retrieve → stance → conflicts → confidence</div>
      </div>

      <div className="panel">
        <h2>Try it</h2>
        <p className="panel-sub">
          Paste an AI-generated claim about OAuth/PKCE. TrustNode returns the sources
          behind it, the supporting evidence, the contradictions, and a confidence score
          with its derivation shown — never a bare number.
        </p>
        <p>
          <a href="/verify" className="btn">Verify a claim →</a>{" "}
          <a href="/sources" className="chip" style={{ textDecoration: "none", padding: "10px 18px" }}>The commons shelf →</a>
        </p>
      </div>

      <div className="panel">
        <h2>Where trust comes from</h2>
        <p className="panel-sub">Three signals, kept distinct — never blended into one mushy score:</p>
        <ul style={{ margin: "0 0 0 18px", padding: 0, color: "var(--text-dim)" }}>
          <li style={{ marginBottom: 8 }}>
            <b style={{ color: "var(--text)" }}>Earned trust (measured)</b> — track record: did this
            source's past claims pan out? Computed, never voted on.
          </li>
          <li style={{ marginBottom: 8 }}>
            <b style={{ color: "var(--text)" }}>Community trust (voted)</b> — users vote, but votes are
            displayed as sentiment, labeled, never silently merged into scores.
          </li>
          <li style={{ marginBottom: 8 }}>
            <b style={{ color: "var(--text)" }}>Your trust (personal)</b> — your allowlist, blocklist,
            weight tweaks. For your queries, you're the final arbiter.
          </li>
        </ul>
        <p className="panel-sub">Trust is per-domain. Gold on medicine can be garbage on crypto.</p>
      </div>

      <div className="panel">
        <h2>The commons</h2>
        <p className="panel-sub">
          TrustNode is built under the{" "}
          <a href="/charter" style={{ color: "var(--accent)" }}>Trust Commons Charter</a>:
          methodology, data, and code are public and forkable; trust is never for sale;
          AI explains but never decides; the network belongs to everyone.
        </p>
      </div>
    </>
  );
}
