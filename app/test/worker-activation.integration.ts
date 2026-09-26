import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { assertWorkerRole, type SqlClient, type TrustLease } from "../worker/graph";

const appDirectory = fileURLToPath(new URL("../", import.meta.url));
const OWNER = "abababab-abab-4bab-8bab-abababababab";
async function until(check: () => Promise<boolean>, message: string) {
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(message);
}
function launch(file: string, args: string[], workerUrl?: string) {
  // Do not pass the test administrator credential to either child process.
  const child = spawn(process.execPath, ["--import", "tsx", file, ...args], {
    cwd: appDirectory,
    env: { PATH: process.env.PATH, NODE_ENV: "test", ...(workerUrl ? { TRUSTNODE_WORKER_DATABASE_URL: workerUrl } : {}) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "", stderr = "", finished = false, code: number | null = null;
  child.stdout.on("data", chunk => { stdout = (stdout + chunk.toString()).slice(-8192); });
  child.stderr.on("data", chunk => { stderr = (stderr + chunk.toString()).slice(-8192); });
  child.on("error", () => { finished = true; });
  child.on("close", exitCode => { code = exitCode; finished = true; });
  return {
    child, output: () => stdout,
    done: async () => {
      await until(async () => finished, "Worker/replay child did not exit within 25 seconds");
      assert.equal(code, 0, "Worker/replay process must exit successfully");
      assert.equal(stderr, "", "Worker/replay process must not emit errors");
    },
    stop: async () => { if (!finished) child.kill("SIGTERM"); },
    cleanup: async () => {
      if (!finished) child.kill("SIGKILL");
      await until(async () => finished, "Child process cleanup timed out");
    },
  };
}

/** Runs only in the existing empty disposable PostgreSQL service, after migrations. */
export async function runWorkerActivationIntegration(db: SqlClient, workerUrl: string) {
  const children: ReturnType<typeof launch>[] = [];
  const start = (once = false) => {
    const child = launch("worker/run.ts", once ? ["--once"] : [], workerUrl);
    children.push(child); return child;
  };
  const value = async (sql: string, args: unknown[] = []) => (await db.query(sql, args)).rows[0].value;
  const owner = async () => {
    await db.query("set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [OWNER]);
  };
  const restricted = new Client({ connectionString: workerUrl });
  let disconnected = false;
  const directory = await mkdtemp(join(tmpdir(), "trustnode-worker-replay-"));
  try {
    await db.query("reset role");
    assert.equal(await value("select count(*)::integer as value from tn_jobs where state in ('queued','leased')"), 0);
    await assert.rejects(assertWorkerRole(db), /restricted login/, "administrator must not be a worker");
    await restricted.connect(); await assertWorkerRole(restricted);
    for (const query of ["select * from tn_graph_snapshots", "update tn_trust_runs set state='failed'", "insert into tn_sources default values"]) {
      await assert.rejects(restricted.query(query), e => (e as { code?: string }).code === "42501");
    }

    const idle = start();
    await until(async () => idle.output().includes('"state":"idle"'), "Worker did not poll");
    assert.equal(await value("select last_seen > clock_timestamp()-interval '10 seconds' as value from tn_graph_worker_health"), true);
    await idle.stop(); await idle.done();
    const stoppedHeartbeat = await value("select last_seen::text as value from tn_graph_worker_health");

    await db.query("insert into auth.users values($1)", [OWNER]); await owner();
    const source = (await value("select tn_save_source(null,$1::jsonb,null) as value", [JSON.stringify({ kind: "link", title: "Worker restart seed", url: "https://worker-activation.example/seed", excerpt: "Disposable activation rehearsal" })])).id;
    const pack = await value("select tn_create_pack('Worker lifecycle','','Activation > Worker','{}',false,$1::jsonb) as value", [JSON.stringify([{ source_id: source, note: "" }])]);
    const version = await value("select tn_capture_pack_version(id,revision,'uniform-seeds-v1',$2::jsonb) as value from tn_packs where id=$1", [pack, JSON.stringify([{ source_id: source, rationale: "Synthetic lifecycle seed" }])]);
    const enqueue = async () => (await value("select tn_enqueue_trust_run(v.id,p.revision,v.evidence_revision,$2) as value from tn_pack_versions v join tn_packs p on p.id=v.pack_id where v.id=$1", [version, randomUUID()])).run_id as string;
    const read = (run: string, part: string) => value("select tn_read_trust_run($1,$2) as value", [run, part]);
    const first = await enqueue();
    assert.equal((await read(first, "status")).state, "queued");
    await db.query("reset role");
    assert.equal(await value("select last_seen::text as value from tn_graph_worker_health"), stoppedHeartbeat, "stopped worker does not poll");
    const once = start(true); await once.done(); await owner();
    assert.equal((await read(first, "status")).state, "completed");
    const canonical = (await read(first, "canonical")).text;
    const input = (await read(first, "input")).text, manifest = await read(first, "manifest");

    const second = await enqueue();
    const stale = (await restricted.query("select tn_lease_trust_job() as value")).rows[0].value as TrustLease;
    assert.equal(stale.run_id, second);
    // Simulate a dead lease holder; only disposable admin backdates the clock.
    await restricted.end(); disconnected = true; await db.query("reset role");
    await db.query("update tn_jobs set lease_until=clock_timestamp()-interval '1 second' where id=$1", [stale.job_id]);
    const restarted = start();
    await until(async () => await value("select state='completed' as value from tn_trust_runs where id=$1", [second]), "Restart did not recover expired work");
    await restarted.stop(); await restarted.done();
    const job = (await db.query("select attempts,lease_token from tn_jobs where run_id=$1", [second])).rows[0];
    assert.equal(job.attempts, 2); assert.notEqual(job.lease_token, stale.lease_token);
    const reconnect = new Client({ connectionString: workerUrl });
    try {
      await reconnect.connect();
      await assert.rejects(reconnect.query("select tn_fail_trust_job($1,$2,'worker_error',true)", [stale.job_id, stale.lease_token]), e => (e as { code?: string }).code === "PT409");
    } finally { await reconnect.end(); }
    await owner();
    assert.equal((await read(first, "canonical")).text, canonical, "restart preserves prior completed bytes");
    assert.equal((await read(second, "canonical")).text, canonical, "recovered frozen input computes identical bytes");
    const paths = ["input.json", "canonical.json", "manifest.json"].map(name => join(directory, name));
    for (const [index, text] of [input, canonical, JSON.stringify(manifest)].entries()) await writeFile(paths[index], text, { mode: 0o600 });
    const replay = launch("worker/replay.ts", paths); children.push(replay); await replay.done();
    assert.equal(JSON.parse(replay.output()).matches, true);
    console.log("Worker process start/heartbeat, SIGTERM stop, queued restart, expired-lease recovery, restricted login and CLI replay passed");
  } finally {
    await Promise.all(children.map(child => child.cleanup()));
    if (!disconnected) await restricted.end().catch(() => {});
    await db.query("reset role");
    await rm(directory, { recursive: true, force: true });
  }
}
