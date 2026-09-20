export const dynamic = "force-dynamic";

export default function CharterPage() {
  return (
    <>
      <div className="meta-line">
        TRUST COMMONS CHARTER <b>v2.0</b> · DRAFT — PENDING SIGN-OFF · AMENDMENTS REQUIRE A NEW VERSION
      </div>
      <h1 className="page-title">The Trust Commons Charter</h1>
      <p className="page-sub">
        What keeps TrustNode and SourceSelect honest. A commitment, in writing, versioned like everything else here.
      </p>
      <div className="panel">
      <p><i>TrustNode · SourceSelect</i></p>
      </div>
      <div className="panel">
      <h2>Preamble</h2>
      <p>Search engines rank without showing why. AI systems answer without showing their sources. Two black boxes, one problem: <b>you cannot check the work.</b></p>
      <p>TrustNode is the trust layer between generative AI and reality: take a claim, get its sources, the evidence, the contradictions, and the provenance — with every number showing its derivation. SourceSelect is the cockpit that makes that machinery visible and adjustable.</p>
      <p>The idea is simple. PageRank proved trust can be computed from a graph of sources. Google hid the machine: secret seeds, secret weights, a black box no one can audit. We run the same playbook in the open — public seeds, public algorithm, inspectable weights, reproducible rankings. A PageRank for sources, with the cover taken off.</p>
      <p>We&#x27;re not building a rival search engine. We&#x27;re building the trust layer that search and AI answers are missing — infrastructure others can build on, and a product we can actually ship.</p>
      <p>This charter is the commitment, in writing, versioned like everything else here.</p>
      </div>
      <div className="panel">
      <h2>Article I — Show your work</h2>
      <p>Every claim must be traceable: <b>answer → claim → source → evidence → confidence.</b> A number without its derivation is a rumor.</p>
      </div>
      <div className="panel">
      <h2>Article II — The commons belongs to everyone</h2>
      <p>Methodology, data, and code are public, versioned, and forkable. Anyone can reproduce every score, audit every weight, and build on top.</p>
      </div>
      <div className="panel">
      <h2>Article III — Trust is never for sale</h2>
      <p>Rankings and trust assessments cannot be bought, sponsored, or boosted. Paid placement never affects any output.</p>
      </div>
      <div className="panel">
      <h2>Article IV — Influence is a liability, not a goal</h2>
      <p>Measuring something can change it. We measure; we don&#x27;t manufacture narratives or pick winners. If our influence ever starts shaping what we measure, the methodology changes — publicly, as a new version.</p>
      </div>
      <div className="panel">
      <h2>Article V — The community contributes; it does not rule</h2>
      <p>Community evidence and votes are welcome as labeled inputs. They are never silently merged into scores. <b>Votes are signals, not verdicts.</b></p>
      </div>
      <div className="panel">
      <h2>Article VI — AI explains; it does not decide</h2>
      <p>Algorithms calculate from evidence. AI may summarize and explain — it never touches the numbers.</p>
      </div>
      <div className="panel">
      <h2>Article VII — The business serves the commons</h2>
      <p>The commons is free and open. Revenue comes from services around it: implementation, custom deployments, enterprise instances, advisory.</p>
      </div>
      <div className="panel">
      <h2>Article VIII — No single point of failure</h2>
      <p>If the founder walks away or sells out, the data stays public, the methodology stays versioned, the code stays forkable. Anyone can continue the work.</p>
      </div>
      <div className="panel">
      <h2>Article IX — Trust is computed in the open</h2>
      <p>Trust is a property of the graph, not a label anyone assigns. A source is trusted when trusted sources corroborate it and its claims verify against evidence. The seed set — the sources trust flows from — is published, versioned, and disputable. Seeds are starting points, not thrones: any seed can be challenged, and trust that stops being earned stops flowing.</p>
      <p><i>v2.0 DRAFT — 2026-09-20, pending Alex Borsody&#x27;s sign-off. Changes from v1.1: scope narrowed to TrustNode + SourceSelect (the Prove-It Clock is a separate project with its own rules); language tightened throughout; market framing added — trust infrastructure, not a rival search engine. Amendments require a new version, never a silent edit.</i></p>
      </div>
    </>
  );
}
