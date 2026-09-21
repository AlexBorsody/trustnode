export const dynamic = "force-dynamic";

import { PIPELINE_VERSION } from "@/trustnode/version";

export default function Home() {
  return (
    <>
      <div className="meta-line">TRUSTNODE <b>v{PIPELINE_VERSION}</b> · SOURCES · CURATION · EVIDENCE</div>
      <h1 className="page-title">Know what your research relies on.</h1>
      <p className="page-sub">
        Collect useful sources, put them in an order you can explain, and explore
        the evidence behind an AI-generated claim.
      </p>
      <div className="panel">
        <h2>Explore sources and see why they rank</h2>
        <p className="panel-sub">
          Search the available source collection. Inspect matched terms, source weights,
          public pack influence, and superseded guidance alongside every result.
        </p>
        <a href="/explore" className="btn">Explore sources →</a>
      </div>
      <div className="panel">
        <h2>Build your source map</h2>
        <p className="panel-sub">
          Bring links together around a topic. Rank them, explain your choices,
          keep your pack private, or publish it for others to explore and copy.
        </p>
        <p style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <a href="/packs" className="btn">Create or browse packs →</a>
          <a href="/sources" className="chip" style={{ textDecoration: "none", padding: "10px 18px" }}>Contribute a source →</a>
        </p>
      </div>
      <div className="panel">
        <h2>Inspect the evidence behind a claim</h2>
        <p className="panel-sub">
          See supporting and contradicting sources, quoted evidence, and a confidence
          calculation you can follow. The current verification demo covers OAuth/PKCE;
          it does not establish whether claims in other domains are true.
        </p>
        <a href="/verify" className="btn">Try claim verification →</a>
      </div>
      <div className="panel">
        <h2>Understand the signals</h2>
        <ul style={{ margin: "0 0 0 18px", padding: 0, color: "var(--text-dim)" }}>
          <li style={{ marginBottom: 8 }}><b>Source weight:</b> the prototype uses published analyst-seeded weights. Measured historical reliability is still future work.</li>
          <li style={{ marginBottom: 8 }}><b>Community curation:</b> public packs can influence retrieval order through visible factors. They do not change canonical claim confidence.</li>
          <li style={{ marginBottom: 8 }}><b>Your selection:</b> choose a pack, result count, and whether to include public pack influence in Explorer.</li>
        </ul>
        <p className="panel-sub">Retrieval rank helps you navigate sources. Evidence helps you decide what to trust.</p>
      </div>
      <p className="panel-sub">Built around public methodology and inspectable evidence. Read the <a href="/charter">Trust Commons Charter</a>.</p>
    </>
  );
}
