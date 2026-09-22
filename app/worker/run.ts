import { Client } from "pg";
import { assertWorkerRole, workOnce } from "./graph";

async function main() {
  if (process.version !== "v22.23.2") throw new Error("Use the pinned Node runtime from .nvmrc.");
  const connectionString = process.env.TRUSTNODE_WORKER_DATABASE_URL;
  if (!connectionString) throw new Error("Configure the restricted worker database login.");
  const url = new URL(connectionString);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  // URL SSL options can override pg's TLS object; require our verified TLS policy.
  if ([...url.searchParams.keys()].some(key => key.startsWith("ssl"))) throw new Error("Remove SSL URL options; the worker configures verified TLS.");
  const db = new Client({ connectionString, ssl: local ? false : { rejectUnauthorized: true, ...(process.env.TRUSTNODE_WORKER_CA ? { ca: process.env.TRUSTNODE_WORKER_CA } : {}) },
    connectionTimeoutMillis: 5000, statement_timeout: 15000, query_timeout: 20000, application_name: "trustnode-graph-worker" });
  await db.connect();
  try {
    await assertWorkerRole(db);
    let stopping = false;
    process.once("SIGTERM", () => { stopping = true; }); process.once("SIGINT", () => { stopping = true; });
    do {
      const result = await workOnce(db);
      console.log(JSON.stringify(result));
      if (process.argv.includes("--once") || stopping) break;
      if (result.state === "idle") await new Promise(resolve => setTimeout(resolve, 2000));
    } while (!stopping);
  } finally { await db.end(); }
}
main().catch(() => { console.error("Graph worker stopped. Check restricted credentials, runtime and database setup; no private error details logged."); process.exitCode = 1; });
