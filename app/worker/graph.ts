import { GraphInputError, GRAPH_TRUST_V1 } from "../src/trustnode/graph";
import { computeArtifact, TrustConvergenceError } from "../src/trustnode/runs/artifact";
export interface SqlClient { query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, any>[] }> }
export interface TrustLease { job_id: string; run_id: string; lease_token: string; lease_until: string; input_hash: string; input_text: string; attempt: number }
export const workerRuntime = () => ({ node: process.version, v8: process.versions.v8, platform: process.platform, arch: process.arch, implementation: GRAPH_TRUST_V1.implementation });

export async function assertWorkerRole(db: SqlClient) {
  const { rows } = await db.query(`select r.rolsuper,r.rolbypassrls,r.rolcreatedb,r.rolcreaterole,r.rolreplication,
    has_schema_privilege(session_user,'public','CREATE') as schema_create,
    pg_has_role(session_user,'tn_graph_worker','member') as worker,
    has_table_privilege(session_user,'public.tn_sources','INSERT') as source_write,
    has_table_privilege(session_user,'public.tn_trust_runs','UPDATE') as result_write
    from pg_roles r where r.rolname=session_user`);
  const role = rows[0];
  if (!role || role.rolsuper || role.rolbypassrls || role.rolcreatedb || role.rolcreaterole || role.rolreplication || role.schema_create || !role.worker || role.source_write || role.result_write) {
    throw new Error("Worker requires a restricted login with only the graph worker role.");
  }
}

/** One lease per call; connection identity and random lease token fence all writes. */
export async function workOnce(db: SqlClient) {
  const { rows } = await db.query("select public.tn_lease_trust_job() as job");
  const lease = rows[0]?.job as TrustLease | null;
  if (!lease) return { state: "idle" as const };
  try {
    const artifact = computeArtifact(lease.input_text, lease.input_hash, workerRuntime());
    const { rows: saved } = await db.query("select public.tn_complete_trust_job($1,$2,$3,$4::jsonb,$5,$6) as run_id",
      [lease.job_id, lease.lease_token, lease.input_hash, JSON.stringify(artifact.raw), artifact.canonical, artifact.output_hash]);
    return { state: "completed" as const, run_id: saved[0].run_id as string, output_hash: artifact.output_hash };
  } catch (error) {
    const code = error instanceof GraphInputError ? "invalid_graph" : error instanceof TrustConvergenceError ? "not_converged"
      : (error as { code?: string })?.code === "PT422" ? "invalid_result" : "worker_error";
    // If completion committed but its response was lost, this failure is rejected
    // by the completed lease. Never overwrite that result or log private SQL data.
    try { await db.query("select public.tn_fail_trust_job($1,$2,$3,$4,$5::jsonb)", [lease.job_id, lease.lease_token, code, code === "worker_error", error instanceof TrustConvergenceError ? JSON.stringify(error.diagnostics) : null]); }
    catch { return { state: "lease_unavailable" as const, run_id: lease.run_id }; }
    return { state: "failed_attempt" as const, run_id: lease.run_id, code };
  }
}
