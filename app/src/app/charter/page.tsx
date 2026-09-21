const principles = [
  {
    "title": "I. Show your work",
    "body": "Every claim must be traceable through its sources, evidence, and confidence derivation."
  },
  {
    "title": "II. Keep the commons open",
    "body": "Methodology, data, and code are public, versioned, reproducible, and forkable."
  },
  {
    "title": "III. Trust is never for sale",
    "body": "Rankings and trust assessments cannot be bought, sponsored, or boosted."
  },
  {
    "title": "IV. Make influence accountable",
    "body": "If the system's influence changes what it measures, revise and version the methodology publicly. Do not hide changes to scoring or ranking."
  },
  {
    "title": "V. Label community influence",
    "body": "Community evidence, votes, and source packs are visible, contestable inputs. They never silently rewrite canonical confidence. Votes are signals, not verdicts."
  },
  {
    "title": "VI. AI explains; it does not decide",
    "body": "Algorithms calculate from evidence. AI may summarize or explain, but never sets the trust numbers."
  },
  {
    "title": "VII. The business serves the commons",
    "body": "Revenue comes from services, implementation, and deployments around the commons. Commercial interests must not corrupt its trust assessments."
  },
  {
    "title": "VIII. Preserve continuity",
    "body": "Data, methodology, and code must remain available for others to continue the project independently of its founder."
  },
  {
    "title": "IX. Compute trust in the open",
    "body": "The long-term trust model uses source relationships and evidence. Seeds, weights, and algorithms are public, versioned, and disputable. Seeds are starting points, not permanent authorities. Community source packs make curation visible; graph authority must be explained and distinguished from measured factual accuracy."
  }
];

export default function CharterPage() {
  return <>
    <div className="meta-line">TRUST COMMONS CHARTER · RETAINED v1.1 PRINCIPLES</div>
    <h1 className="page-title">The Trust Commons Charter</h1>
    <p className="page-sub">TrustNode and SourceSelect. The commons principles behind our source network and inspectable methodology.</p>
    {principles.map(principle => <section className="panel" key={principle.title}><h2>{principle.title}</h2><p>{principle.body}</p></section>)}
    <section className="panel"><h2>Version record</h2><p>The retained charter records v1.1 as ratified on September 19, 2026. This is an editorial consolidation of those principles and Alex’s source-pack clarifications, not a new ratification. Substantive amendments require a new version and Alex’s decision.</p>
      <p><a href="https://github.com/AlexBorsody/trustnode/blob/main/docs/Business/CHARTER.md">Read the retained charter and version history →</a></p>
    </section>
  </>;
}
