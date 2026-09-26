import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { runTrustIntegration } from "./trust-runs.integration";
import { runTemplateForkIntegration } from "./template-forks.integration";
import { runTemplateMergeIntegration } from "./template-merges.integration";
import { runTemplateDiscoveryIntegration } from "./template-discovery.integration";
import { runTemplateReferenceIntegration } from "./template-reference.integration";
async function main() {
  if (!process.env.TRUSTNODE_TEST_DATABASE_URL) throw new Error("Set TRUSTNODE_TEST_DATABASE_URL to an empty disposable PostgreSQL database.");
  const connect = async () => { const db = new Client({ connectionString: process.env.TRUSTNODE_TEST_DATABASE_URL }); await db.connect(); return db; };
  const db = await connect();
  let worker: Client | undefined;
  const restricted = async () => {
    const password = randomUUID();
    await db.query(`create role trust_worker_fixture login inherit nosuperuser nocreatedb nocreaterole nobypassrls password '${password}'`);
    await db.query("grant tn_graph_worker to trust_worker_fixture");
    const url = new URL(process.env.TRUSTNODE_TEST_DATABASE_URL!); url.username = "trust_worker_fixture"; url.password = password;
    worker = new Client({ connectionString: url.toString() }); await worker.connect(); return worker;
  };
  try { await runTrustIntegration(db, connect, restricted); await runTemplateForkIntegration(db); await runTemplateMergeIntegration(db, connect); await runTemplateDiscoveryIntegration(db); await runTemplateReferenceIntegration(db); } finally { await worker?.end(); await db.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
