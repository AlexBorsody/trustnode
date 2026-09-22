"use client";
import { useEffect, useRef, useState } from "react";
import type { ProjectionKind } from "../trustnode/graph";
import { UUID } from "../packs/model";
import { compareRuns, labelNode, safeSourceUrl, scoreRows, type RunBundle } from "./model";
import { requestJson, useRun } from "./client";
const number = (value: number) => value.toFixed(8);
const failures: Record<string, string> = { invalid_graph: "The frozen graph has unusable inputs or exceeds the supported limits.",
  not_converged: "This computation did not converge. No completed ranking was published.", worker_error: "The worker could not finish after its bounded retries.",
  lease_expired: "The worker stopped responding before completion.", invalid_result: "The result failed validation and was not stored as a completed ranking." };

export default function RunPanel({ runId, token, userId }: { runId: string; token?: string; userId?: string }) {
  const state = useRun(runId, token), [projection, setProjection] = useState<ProjectionKind>("site");
  const [focus, setFocus] = useState(""), [page, setPage] = useState(0), [compareId, setCompareId] = useState("");
  const [compareDraft, setCompareDraft] = useState(""), [notice, setNotice] = useState(""), [actionError, setActionError] = useState(""), [busy, setBusy] = useState(false);
  const action = useRef<AbortController | null>(null);
  useEffect(() => () => action.current?.abort(), []);
  const bundle = state.bundle;
  async function publish() {
    if (!bundle || !token) return;
    const ctrl = new AbortController(); action.current = ctrl; setBusy(true); setActionError(""); setNotice("");
    try {
      await requestJson(`/api/trust/runs/${runId}/publish`, token, ctrl.signal, { pack_revision: bundle.status.pack_revision, evidence_revision: bundle.status.evidence_revision });
      if (!ctrl.signal.aborted) { setNotice("Run published. Its inputs and explanations follow the template’s current visibility."); state.reload(); }
    } catch (e) { if (!ctrl.signal.aborted) { setActionError(e instanceof Error ? e.message : "Could not publish."); state.reload(); } }
    finally { if (!ctrl.signal.aborted) setBusy(false); }
  }
  async function download(part: string) {
    const ctrl = new AbortController(); action.current = ctrl; setBusy(true); setActionError("");
    try {
      const response = await fetch(`/api/trust/runs/${runId}/export?part=${part}`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: ctrl.signal, cache: "no-store" });
      if (!response.ok) { const result = await response.json(); throw new Error(result.error ?? "Export unavailable."); }
      const blob = await response.blob();
      if (!ctrl.signal.aborted) {
        const url = URL.createObjectURL(blob), link = document.createElement("a");
        link.href = url; link.download = `trust-${runId}-${part}.json`;
        document.body.appendChild(link); link.click(); link.remove();
        // Let the browser begin the download before releasing its bytes.
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (e) { if (!ctrl.signal.aborted) { setActionError(e instanceof Error ? e.message : "Could not export."); state.reload(); } }
    finally { if (!ctrl.signal.aborted) setBusy(false); }
  }
  const result = bundle?.artifact.results[projection], rows = result ? scoreRows(result) : [];
  const owner = bundle?.input.template.snapshot.owner_id === userId;
  return <section aria-label="Trust run">
    <div className="panel">
      <h2>Trust run</h2><p className="trust-id">Run {runId}</p>
      <button className="chip" onClick={() => { action.current?.abort(); setBusy(false); state.reload(); }}>Refresh run and access</button>
      {state.error && <p role="alert">{state.error}</p>}
      {!state.status && !state.error && <p role="status">Loading run…</p>}
      {state.status?.state === "completed" && !bundle && !state.error && <p role="status">Loading frozen inputs and explanations…</p>}
      {state.status && state.status.state !== "completed" && <p role="status">{state.status.state === "failed" ? failures[state.status.failure_code ?? ""] ?? "Run failed; no completed ranking is available." : `Run ${state.status.state}. Waiting for completed results…`}</p>}
      {state.paused && <p>Automatic checks paused after one minute. Refresh to check again.</p>}
      {notice && <p role="status">{notice}</p>}{actionError && <p role="alert">{actionError}</p>}
      {bundle && <>
        <h3>{bundle.input.template.snapshot.title}</h3>
        <p>{bundle.input.template.snapshot.category} · Template {bundle.input.template.id.slice(0, 8)} · {bundle.status.published ? "Publication recorded" : "Unpublished · requester only"} · {bundle.status.current_public === false ? "Template currently private" : bundle.status.current_public === true ? "Template currently public" : "Current visibility unavailable"}</p>
        {bundle.status.published && bundle.status.public_readable === false && <p className="gate">Public access to this run was revoked by a visibility change. Making the template public again does not restore this publication; compute and publish a new run.</p>}
        {!bundle.input.captured_public && <p className="gate">Captured from a private template. This run cannot be published; create a new run after making the template public.</p>}
        {bundle.status.stale && <p className="gate" role="status">Stale run: the current pack, evidence or visibility changed. These scores still describe the frozen inputs shown here.</p>}
        <p className="trust-id">Input SHA-256: {bundle.status.input_hash}</p>
        <p><a href={`/packs/${bundle.input.template.pack_id}?version=${bundle.input.template.id}`}>Open source template and current evidence</a></p>
        {owner && <><p className="panel-sub">Publishing shares this run’s frozen inputs and explanations with readers of the public template.</p>
          <button className="btn" disabled={busy || bundle.status.published || bundle.status.stale || !bundle.input.captured_public} onClick={publish}>{bundle.status.published ? "Published" : "Publish this run"}</button></>}
        <div className="trust-actions">{["input", "canonical", "manifest", "raw"].map(part => <button className="chip" key={part} disabled={busy} onClick={() => download(part)}>Export {part}</button>)}</div>
        <details><summary>Replay this computation</summary><p>Download input, canonical and manifest files. Preserve their exact bytes; the manifest records their hashes and runtime. From the project’s app directory with Node 22.23.2:</p>
          <code>npm run graph:replay -- input.json canonical.json manifest.json</code></details>
      </>}
    </div>
    {bundle && result && <>
      <section className="panel" aria-label="Graph rankings">
        <h2>Relative graph authority</h2>
        <label>Projection<select className="claim-input" value={projection} onChange={e => { setProjection(e.target.value as ProjectionKind); setFocus(""); setPage(0); }}>
          <option value="site">Sites</option><option value="resource">Resources</option>
        </select></label>
        <p className="panel-sub">Mass belongs to this run and projection. The 0–10 display index is relative to its strongest node; it does not measure factual accuracy.</p>
        {result.evidence_state === "seed_only" && <p className="gate">Seed-only: no eligible evidence edges. The ranking reflects starting seed preferences.</p>}
        {result.evidence_state === "no_seed_reachable_edges" && <p className="gate">No evidence edge receives seed mass. Disconnected members may have zero mass.</p>}
        <p>{result.diagnostics.node_count} nodes · {result.diagnostics.edge_count} eligible pairs · {result.diagnostics.seed_count} seeds · {result.diagnostics.iterations} iterations · residual {result.diagnostics.residual.toExponential(2)}</p>
        <p className="panel-sub">{bundle.artifact.graph[projection].exclusions.length} recorded exclusions/duplicate supports · {bundle.artifact.graph.site.unmapped_resources.length} resources without site mapping</p>
        <div className="table-wrap"><table className="spec"><thead><tr><th>Rank</th><th>{projection === "site" ? "Site" : "Resource"}</th><th>Raw mass</th><th>Relative index</th><th>Seed mass</th></tr></thead>
          <tbody>{rows.slice(page * 25, page * 25 + 25).map((score, i) => <tr key={score.node_id}><td>{page * 25 + i + 1}</td><td><button className="chip" onClick={() => setFocus(score.node_id)}>{labelNode(bundle, projection, score.node_id)}</button></td>
            <td className="num">{number(score.mass)}</td><td className="num">{score.display_index.toFixed(1)} / 10</td><td className="num">{number(score.seed_mass)}</td></tr>)}</tbody></table></div>
        <div className="trust-actions"><button className="chip" disabled={page === 0} onClick={() => setPage(n => n - 1)}>Previous nodes</button><button className="chip" disabled={(page + 1) * 25 >= rows.length} onClick={() => setPage(n => n + 1)}>More nodes</button></div>
        <p className="panel-sub">A zero mass is a ranked node with no earned mass. Nodes outside this snapshot are unknown, not zero.</p>
      </section>
      {focus && <NodeExplanation key={`${projection}:${focus}`} bundle={bundle} projection={projection} nodeId={focus} />}
      <section className="panel" aria-label="Compare trust runs">
        <h2>Compare two runs</h2>
        <form onSubmit={e => { e.preventDefault(); if (UUID.test(compareDraft) && compareDraft.toLowerCase() !== runId) setCompareId(compareDraft.toLowerCase()); }}>
          <label>Second run ID<input className="claim-input" required pattern="[a-fA-F0-9-]{36}" value={compareDraft} onChange={e => { setCompareDraft(e.target.value); setCompareId(""); }} /></label>
          <button className="chip" style={{ marginTop: 10 }} disabled={compareDraft.toLowerCase() === runId}>Compare runs</button>
        </form>
        {compareId && <RunComparison key={compareId} primary={bundle} otherId={compareId} projection={projection} token={token} />}
      </section>
    </>}
  </section>;
}
function NodeExplanation({ bundle, projection, nodeId }: { bundle: RunBundle; projection: ProjectionKind; nodeId: string }) {
  const [page, setPage] = useState(0), [excludedPage, setExcludedPage] = useState(0);
  const score = bundle.artifact.results[projection].scores.find(n => n.node_id === nodeId);
  if (!score) return <p role="status">Unknown node: it has no score in this snapshot.</p>;
  const revisions = new Map(bundle.input.relationships.map(e => [e.current_revision.id, e]));
  const members = new Map(bundle.input.template.snapshot.entries.map(e => [e.source_id, e]));
  const graph = bundle.artifact.graph[projection];
  const seedEntries = bundle.input.template.snapshot.entries.filter(e => e.is_seed && (projection === "resource" ? e.source_id === nodeId : e.site_id === nodeId));
  const relevant = graph.edges.filter(e => e.source === nodeId || e.target === nodeId).flatMap(edge => edge.evidence.map(reference => ({ edge, reference, record: revisions.get(reference.revision_id) })));
  const excluded = graph.exclusions.filter(e => projection === "resource" ? e.source_id === nodeId || e.target_id === nodeId : members.get(e.source_id)?.site_id === nodeId || members.get(e.target_id)?.site_id === nodeId);
  const incoming = [...score.contributions.incoming].sort((a, b) => b.amount - a.amount || a.source_id.localeCompare(b.source_id));
  return <section className="panel" aria-label="Score explanation">
    <h2>Why this node ranks</h2><h3>{labelNode(bundle, projection, nodeId)}</h3><p className="trust-id">Run {bundle.status.run_id} · {projection} · {nodeId}</p>
    <div className="formula">Direct seed {number(score.contributions.direct_seed)} + incoming {number(score.contributions.incoming_total)} + dangling redistribution {number(score.contributions.dangling)} = {number(score.mass)}</div>
    {!!seedEntries.length && <details><summary>Declared seed rationale · {seedEntries.length} resource(s)</summary>
      <p>Captured seed mode: {bundle.input.template.snapshot.seed_mode}. Site seed mass uses the strongest declared resource weight on that host.</p>
      <ul>{seedEntries.map(entry => <li key={entry.source_id}>{entry.title}: {entry.rationale}</li>)}</ul>
    </details>}
    <p className="panel-sub">Values are rounded for display. Full raw contributions reproduce the final update; exports retain every contribution and the previous iteration.</p>
    <ul>{incoming.slice(0, 5).map(c => <li key={c.source_id}>{labelNode(bundle, projection, c.source_id)} → {number(c.amount)} from {c.evidence.length} supporting record(s), counted as one directed pair</li>)}</ul>
    {incoming.length > 5 && <p>Remaining {incoming.length - 5} incoming pairs: {number(incoming.slice(5).reduce((sum, c) => sum + c.amount, 0))} mass. All are included in the raw export.</p>}
    <h3>Focused evidence: incoming and outgoing</h3><p className="panel-sub">Frozen evidence from this same run. Citation direction is visible; an outgoing edge passes mass to its target.</p>
    {!relevant.length && <p>No accepted propagating relationships touch this node.</p>}
    {relevant.slice(page * 10, page * 10 + 10).map(({ edge, reference, record }) => <details className="trust-evidence" key={reference.edge_id}>
      <summary>{labelNode(bundle, projection, edge.source)} → {labelNode(bundle, projection, edge.target)} · {record?.current_revision.body.relation ?? "Evidence unavailable"}</summary>
      <p className="trust-id">Evidence {reference.edge_id} · revision {reference.revision_id} · accepted decision {reference.decision_id}</p>
      {record ? <><p>{record.current_revision.body.rationale}</p><p>{record.current_revision.body.claim_scope}</p>
        <p>{record.current_revision.body.source_locator} · observed {record.current_revision.body.observed_on}</p><blockquote>{record.current_revision.body.source_quote}</blockquote>
        {record.current_revision.body.target_quote && <><p>{record.current_revision.body.target_locator}</p><blockquote>{record.current_revision.body.target_quote}</blockquote></>}
        {safeSourceUrl(members.get(record.current_revision.body.source_id)?.url ?? null) && <a href={safeSourceUrl(members.get(record.current_revision.body.source_id)!.url)!} target="_blank" rel="noopener noreferrer">Open cited source record</a>}
        <FrozenReviews bundle={bundle} revisionId={record.current_revision.id} />
      </> : <p>Missing frozen evidence; inspect the export before relying on this explanation.</p>}
    </details>)}
    <div className="trust-actions"><button className="chip" disabled={!page} onClick={() => setPage(n => n - 1)}>Previous evidence</button><button className="chip" disabled={(page + 1) * 10 >= relevant.length} onClick={() => setPage(n => n + 1)}>More evidence</button></div>
    <h3>Recorded conflicts and exclusions</h3>
    {!excluded.length && <p>No recorded exclusions touch this node.</p>}
    {excluded.slice(excludedPage * 10, excludedPage * 10 + 10).map((e, i) => <details className="trust-evidence" key={`${e.edge_id}:${i}`}><summary>{e.relation} · {e.reason.replaceAll("_", " ")}</summary>
      <p>{members.get(e.source_id)?.title ?? e.source_id} → {members.get(e.target_id)?.title ?? e.target_id}</p>
      <p>{revisions.get(e.revision_id)?.current_revision.body.rationale ?? "No captured explanation."}</p><p className="trust-id">Revision {e.revision_id}</p>
      <FrozenReviews bundle={bundle} revisionId={e.revision_id} />
    </details>)}
    <div className="trust-actions"><button className="chip" disabled={!excludedPage} onClick={() => setExcludedPage(n => n - 1)}>Previous exclusions</button><button className="chip" disabled={(excludedPage + 1) * 10 >= excluded.length} onClick={() => setExcludedPage(n => n + 1)}>More exclusions</button></div>
  </section>;
}
function FrozenReviews({ bundle, revisionId }: { bundle: RunBundle; revisionId: string }) {
  const [page, setPage] = useState(0);
  const reviews = bundle.input.reviews.filter(review => review.revision_id === revisionId).sort((a, b) => a.id - b.id);
  return <div><h4>Captured decisions and challenges</h4>
    <p className="panel-sub">Challenges record disagreement separately. Only the recorded curator decision controls acceptance.</p>
    {!reviews.length && <p>No review events recorded for this revision.</p>}
    <ol>{reviews.slice(page * 10, page * 10 + 10).map(review => <li key={review.id}>
      <p>{review.action} · event {review.id}{review.challenge_id ? ` · challenge ${review.challenge_id}` : ""} · {review.created_at}</p>
      <p>{review.reason}</p>{review.locator && <p>{review.locator}</p>}{review.excerpt && <blockquote>{review.excerpt}</blockquote>}
    </li>)}</ol>
    {reviews.length > 10 && <div className="trust-actions"><button className="chip" disabled={!page} onClick={() => setPage(n => n - 1)}>Previous review events</button><button className="chip" disabled={(page + 1) * 10 >= reviews.length} onClick={() => setPage(n => n + 1)}>More review events</button></div>}
  </div>;
}
function RunComparison({ primary, otherId, projection, token }: { primary: RunBundle; otherId: string; projection: ProjectionKind; token?: string }) {
  const other = useRun(otherId, token), [page, setPage] = useState(0);
  const comparison = other.bundle ? compareRuns(primary, other.bundle, projection) : null;
  useEffect(() => setPage(0), [projection]);
  return <div style={{ marginTop: 16 }}>
    <p className="trust-id">First {primary.status.run_id} · second {otherId} · {projection}</p>
    {other.error && <p role="alert">{other.error}</p>}
    {!other.error && !comparison && <p role="status">{other.status?.state === "failed" ? "The second run failed and has no completed ranking." : other.paused ? "Polling paused. Refresh the second run." : "Loading the second completed run…"}</p>}
    <button className="chip" onClick={other.reload}>Refresh second run and access</button>
    {comparison && other.bundle && <>
      <p>{comparison.same_input ? "Both runs use the same frozen input." : "Frozen inputs differ."} {primary.status.stale || other.bundle.status.stale ? "At least one run is stale." : ""}</p>
      <ul><li>Category: {comparison.same_category ? "same" : "different — these are different category scopes"}</li>
        <li>Graph membership and evidence: {comparison.same_graph ? "same" : "different — score changes cannot be attributed to seeds alone"}</li>
        <li>Method and edge policy: {comparison.same_policy ? "same" : "different"}</li><li>Seed distribution: {comparison.same_seeds ? "same" : "different"}</li></ul>
      <p className="panel-sub">Raw mass is relative to each run’s scope. Missing nodes remain unknown; the display index is not compared across projections.</p>
      <div className="table-wrap"><table className="spec"><thead><tr><th>Node</th><th>First mass</th><th>Second mass</th><th>Change</th></tr></thead>
        <tbody>{comparison.rows.slice(page * 25, page * 25 + 25).map(row => <tr key={row.id}><td>{labelNode(row.left === null ? other.bundle! : primary, projection, row.id)}</td>
          <td className="num">{row.left === null ? "Unknown / not included" : number(row.left)}</td><td className="num">{row.right === null ? "Unknown / not included" : number(row.right)}</td>
          <td className="num">{row.delta === null ? "Not comparable" : `${row.delta > 0 ? "+" : ""}${number(row.delta)}`}</td></tr>)}</tbody></table></div>
      <div className="trust-actions"><button className="chip" disabled={!page} onClick={() => setPage(n => n - 1)}>Previous comparison nodes</button><button className="chip" disabled={(page + 1) * 25 >= comparison.rows.length} onClick={() => setPage(n => n + 1)}>More comparison nodes</button></div>
    </>}
  </div>;
}
