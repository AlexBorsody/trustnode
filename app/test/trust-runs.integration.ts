import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { computeArtifact, replayArtifact, sha256, stableJson } from "../src/trustnode/runs/artifact";
import { assertWorkerRole, workOnce, workerRuntime, type SqlClient, type TrustLease } from "../worker/graph";
const OWNER = "11111111-1111-4111-8111-111111111111", OTHER = "22222222-2222-4222-8222-222222222222";
function expand(path: string): string {
  return readFileSync(path, "utf8").split("\n").map(line => line.startsWith("\\set") ? "" : line.startsWith("\\ir ") ? expand(resolve(dirname(path), line.slice(4).trim())) : line).join("\n");
}
async function code(expected: string, promise: Promise<unknown>) {
  await assert.rejects(promise, e => (e as { code?: string }).code === expected);
}
export async function runTrustIntegration(db: SqlClient, connection?: () => Promise<SqlClient & { end(): Promise<void> }>, restrictedConnection?: () => Promise<SqlClient>) {
  assert.equal((await db.query("select to_regclass('public.tn_sources') as existing")).rows[0].existing, null, "Use an empty disposable database only.");
  await db.query(expand(fileURLToPath(new URL("../../db/tests/trust-runs.sql", import.meta.url))));
  const restrictedWorker = await restrictedConnection?.();
  if (restrictedWorker) await assertWorkerRole(restrictedWorker);
  const role = async (name: "authenticated" | "anon" | "tn_graph_worker" | "admin", id = OWNER) => {
    await db.query(name === "admin" ? "reset role" : `set role ${name}`);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [name === "anon" ? "" : id]);
  };
  const value = async (sql: string, args: unknown[] = []) => (await db.query(sql, args)).rows[0].value;
  await role("authenticated");
  const a = (await value("select tn_save_source(null,$1::jsonb,null) as value", [JSON.stringify({ kind: "link", title: "Trust fixture A", url: "https://trust-a.example/fixture", excerpt: "Synthetic fixture" })])).id;
  const b = (await value("select tn_save_source(null,$1::jsonb,null) as value", [JSON.stringify({ kind: "link", title: "Trust fixture B", url: "https://trust-b.example/fixture", excerpt: "Synthetic fixture" })])).id;
  const pack = await value("select tn_create_pack('Trust run fixture','','Fixture','{}',false,$1::jsonb) as value", [JSON.stringify([{ source_id: a, note: "" }, { source_id: b, note: "" }])]);
  const revision = await value("select revision as value from tn_packs where id=$1", [pack]);
  const version = await value("select tn_capture_pack_version($1,$2,'uniform-seeds-v1',$3::jsonb) as value", [pack, revision, JSON.stringify([{ source_id: a, rationale: "Synthetic seed, not an endorsement" }])]);
  const body = { source_id: a, target_id: b, relation: "cites", rationale: "Synthetic evidence", source_locator: "Fixture A", source_quote: "Fixture A cites B", observed_on: "2026-09-22" };
  let first: { edge_id: string; revision_id: string } | undefined;
  for (let i = 0; i < 25; i++) {
    const edge = await value("select tn_save_relationship($1,null,null,$2::jsonb) as value", [version, JSON.stringify(body)]);
    first ??= edge;
    await db.query("select tn_review_relationship($1,'accept','Reviewed fixture',null,true,'','',null)", [edge.revision_id]);
  }
  const tokens = async () => (await db.query("select p.revision,v.evidence_revision::integer from tn_packs p join tn_pack_versions v on v.pack_id=p.id where v.id=$1", [version])).rows[0];
  const enqueue = async (key = randomUUID(), supplied?: Record<string, any>) => {
    const t = supplied ?? await tokens();
    return value("select tn_enqueue_trust_run($1,$2,$3,$4) as value", [version, t.revision, t.evidence_revision, key]);
  };
  const read = (run: string, part = "status") => value("select tn_read_trust_run($1,$2) as value", [run, part]);
  const publish = async (run: string) => { const t = await tokens(); return value("select tn_publish_trust_run($1,$2,$3) as value", [run, t.revision, t.evidence_revision]); };
  const visibility = (visible: boolean) => db.query("update tn_packs set is_public=$2 where id=$1", [pack, visible]);
  const lease = async () => { await role("tn_graph_worker"); return await value("select tn_lease_trust_job() as value") as TrustLease; };
  const finish = (job: TrustLease, changed?: ReturnType<typeof computeArtifact>) => {
    const output = changed ?? computeArtifact(job.input_text, job.input_hash, workerRuntime());
    return value("select tn_complete_trust_job($1,$2,$3,$4::jsonb,$5,$6) as value", [job.job_id, job.lease_token, job.input_hash, JSON.stringify(output.raw), output.canonical, output.output_hash]);
  };

  await code("PT503", enqueue());
  assert.equal(await lease(), null); // heartbeat establishes a live worker
  await role("authenticated");
  const key = randomUUID(), run = (await enqueue(key)).run_id;
  assert.equal((await enqueue(key)).run_id, run);
  const alias = randomUUID(); assert.equal((await enqueue(alias)).run_id, run);
  const t = await tokens(); await code("PT409", enqueue(randomUUID(), { ...t, evidence_revision: t.evidence_revision - 1 }));
  await code("42501", db.query("select tn_lease_trust_job()"));
  await role("authenticated", OTHER); await code("PT404", read(run));
  assert.equal((await db.query("select * from tn_graph_snapshots")).rows.length, 0);
  await role("tn_graph_worker"); const worked = await workOnce(restrictedWorker ?? db); assert.equal(worked.state, "completed");
  await role("authenticated");
  const status = await read(run); assert.equal(status.state, "completed"); assert.equal(status.published, false);
  const input = (await read(run, "input")).text, canonical = (await read(run, "canonical")).text, manifest = await read(run, "manifest");
  assert.equal(JSON.parse(input).relationships.length, 25, "capture must exceed the UI's 20-row page");
  assert.equal(JSON.parse(input).reviews.length, 25);
  assert.equal(JSON.parse(canonical).graph.resource.edges.length, 1);
  assert.equal(replayArtifact(input, canonical, manifest.output_hash).matches, true);
  assert.equal((await enqueue(alias)).run_id, run, "coalesced request key remains idempotent after completion");
  await code("PT409", publish(run));
  await role("anon"); await code("PT404", read(run, "input"));
  await role("authenticated", OTHER); await code("PT404", read(run, "canonical"));
  await role("authenticated"); await visibility(true); await code("PT409", publish(run));
  console.log("Stored private run, full evidence capture, replay, ownership and idempotency passed");

  const inFlight = (await enqueue()).run_id, job = await lease();
  await role("authenticated"); await visibility(false);
  await role("tn_graph_worker"); await finish(job);
  await role("authenticated"); await code("PT409", publish(inFlight)); await visibility(true); await code("PT409", publish(inFlight));
  const published = (await enqueue()).run_id; await role("tn_graph_worker"); assert.equal((await workOnce(db)).state, "completed");
  await role("authenticated"); await publish(published);
  await role("anon"); assert.equal((await read(published)).published, true); assert.equal((await read(published, "manifest")).output_hash.length, 64);
  await role("authenticated", OTHER); assert.equal((await read(published, "input")).text.length > 0, true);
  await role("authenticated"); await visibility(false);
  await role("anon"); await code("PT404", read(published)); assert.equal((await db.query("select * from tn_trust_scores where run_id=$1", [published])).rows.length, 0);
  await role("authenticated"); await visibility(true);
  await role("anon"); await code("PT404", read(published));
  await role("authenticated"); assert.equal((await read(published)).stale, true);
  console.log("Explicit publication and visibility epoch isolation passed");

  const retried = (await enqueue()).run_id, stale = await lease();
  await role("admin"); await db.query("update tn_jobs set lease_until=clock_timestamp()-interval '1 second' where id=$1", [stale.job_id]);
  const fresh = await lease(); assert.equal(fresh.job_id, stale.job_id); assert.notEqual(fresh.lease_token, stale.lease_token);
  await code("PT409", finish(stale)); await code("PT409", db.query("select tn_fail_trust_job($1,$2,'worker_error',true)", [stale.job_id, stale.lease_token]));
  if (restrictedWorker) await code("PT409", restrictedWorker.query("select tn_fail_trust_job($1,$2,'worker_error',true)", [fresh.job_id, fresh.lease_token]));
  await finish(fresh); await finish(fresh);
  const conflict = computeArtifact(fresh.input_text, fresh.input_hash, workerRuntime()); conflict.output_hash = "0".repeat(64);
  await code("PT409", finish(fresh, conflict));
  await role("authenticated"); assert.equal((await read(retried)).state, "completed");
  const failed = (await enqueue()).run_id, badLease = await lease(), bad = computeArtifact(badLease.input_text, badLease.input_hash, workerRuntime());
  bad.raw.results.site.status = "not_converged"; bad.canonical = stableJson(bad.raw); bad.output_hash = sha256(bad.canonical);
  await code("PT422", finish(badLease, bad));
  await db.query("select tn_fail_trust_job($1,$2,'not_converged',false,'{\"site\":{\"iterations\":100,\"residual\":0.01}}'::jsonb)", [badLease.job_id, badLease.lease_token]);
  await role("authenticated"); assert.equal((await read(failed)).state, "failed"); assert.equal((await read(failed)).failure_diagnostics.site.iterations, 100); await code("PT409", publish(failed));
  assert.equal((await db.query("select * from tn_trust_scores where run_id=$1", [failed])).rows.length, 0);
  const exhausted = (await enqueue()).run_id;
  for (let i = 1; i <= 3; i++) { const attempt = await lease(); assert.equal(attempt.attempt, i); await db.query("select tn_fail_trust_job($1,$2,'worker_error',true)", [attempt.job_id, attempt.lease_token]); }
  await role("authenticated"); assert.equal((await read(exhausted)).state, "failed");
  console.log("Expired lease fencing, repeated completion, atomic rejection and bounded retries passed");

  if (connection) {
    const writer = await connection(), capture = await connection();
    try {
      for (const client of [writer, capture]) { await client.query("set role authenticated"); await client.query("select set_config('request.jwt.claim.sub',$1,false)", [OWNER]); }
      const oldTokens = await tokens();
      await writer.query("begin");
      const revised = (await writer.query("select tn_save_relationship($1,$2,$3,$4::jsonb) as value", [version, first!.edge_id, first!.revision_id, JSON.stringify({ ...body, source_quote: "Revised synthetic quotation" })])).rows[0].value;
      let settled = false;
      const race = capture.query("/* trust_capture_race */ select tn_enqueue_trust_run($1,$2,$3,$4)", [version, oldTokens.revision, oldTokens.evidence_revision, randomUUID()]).then(() => { settled = true; return "unexpected_success"; }, error => { settled = true; return error.code; });
      await role("admin");
      let blocked = false;
      for (let i = 0; i < 100; i++) {
        blocked = (await db.query("select exists(select 1 from pg_stat_activity where query like '/* trust_capture_race */%' and wait_event_type='Lock') as blocked")).rows[0].blocked;
        if (blocked || settled) break;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      assert(blocked && !settled, "capture must wait for the evidence writer's pack lock");
      await writer.query("commit"); assert.equal(await race, "PT409");
      await role("authenticated"); const freshTokens = await tokens();
      await capture.query("begin");
      const captureRun = (await capture.query("select tn_enqueue_trust_run($1,$2,$3,$4) as value", [version, freshTokens.revision, freshTokens.evidence_revision, randomUUID()])).rows[0].value.run_id;
      const review = writer.query("/* trust_review_race */ select tn_review_relationship($1,'accept','Concurrent fixture review',null,true,'','',null)", [revised.revision_id]);
      await role("admin"); blocked = false;
      for (let i = 0; i < 100; i++) {
        blocked = (await db.query("select exists(select 1 from pg_stat_activity where query like '/* trust_review_race */%' and wait_event_type='Lock') as blocked")).rows[0].blocked;
        if (blocked) break;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      assert(blocked, "review must wait for the capture's pack lock");
      await capture.query("commit"); await review;
      await role("authenticated"); const frozen = JSON.parse((await read(captureRun, "input")).text);
      assert.equal(frozen.template.evidence_revision, freshTokens.evidence_revision);
      assert.equal(frozen.relationships.find((r: any) => r.id === first!.edge_id).current_decision, null);
      assert.equal((await read(captureRun)).stale, true);
      await role("tn_graph_worker"); assert.equal((await workOnce(db)).state, "completed");
      console.log("Concurrent capture/revision and capture/review lock isolation passed");
    } finally { await writer.query("rollback").catch(() => {}); await capture.query("rollback").catch(() => {}); await writer.end(); await capture.end(); }
  } else console.log("Concurrent session checks require PostgreSQL; run in hosted database CI");
  await role("admin");
}
