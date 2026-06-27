// Seeds agents + KPI definitions and ingests the fixture calls so the dashboard has data.
// Safe to re-run (idempotent via upserts + idempotency keys).
import { config, assertRuntimeConfig } from "../config/index.js";
import { getRepositories, initRepositories } from "./index.js";
import { getQueue } from "../queue/index.js";
import { startWorker } from "../worker.js";
import { AGENTS, KPIS, CALLS, LOCATION_ID } from "../adapters/ghl/fixtures.js";
import { ingestCall } from "../ingestion/service.js";
import { createGHLAdapter } from "../adapters/ghl/adapter.js";
import { logger } from "../lib/logger.js";

export async function seed() {
  const repos = getRepositories();
  for (const a of AGENTS) await repos.agents.upsert(a);
  for (const k of KPIS) await repos.kpis.upsert(k);

  const ghl = createGHLAdapter();
  for (const call of CALLS) await ingestCall(call, { ghl });

  logger.info({ location: LOCATION_ID, agents: AGENTS.length, calls: CALLS.length }, "seed complete");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  assertRuntimeConfig();
  await initRepositories();
  // For memory queue, run the worker in-process so seeded calls get analyzed.
  if (config.QUEUE_DRIVER === "memory") await startWorker();
  await seed();
  if (config.QUEUE_DRIVER === "memory") {
    const q = await getQueue();
    await q.drain?.(15000);
  }
  process.exit(0);
}
