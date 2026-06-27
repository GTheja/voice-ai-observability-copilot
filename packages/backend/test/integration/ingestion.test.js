// End-to-end: ingest fixture calls → in-memory queue → analysis worker → persistence.
// Exercises idempotency, the full pipeline, and the dead-letter path — no Postgres/Redis.
import { describe, it, expect, beforeEach } from "vitest";
import { CallStatus } from "@copilot/shared";
import { createMemoryRepositories, setRepositories } from "../../src/db/index.js";
import { MemoryQueue } from "../../src/queue/memoryQueue.js";
import { setQueue } from "../../src/queue/index.js";
import { startWorker } from "../../src/worker.js";
import { ingestCall } from "../../src/ingestion/service.js";
import { AGENTS, KPIS, CALLS } from "../../src/adapters/ghl/fixtures.js";
import { MockGHLAdapter } from "../../src/adapters/ghl/mock.js";

let repos;
let queue;

async function bootstrap() {
  repos = createMemoryRepositories();
  setRepositories(repos);
  queue = new MemoryQueue({ name: "analysis", maxAttempts: 3, baseMs: 1 });
  setQueue(queue);
  for (const a of AGENTS) await repos.agents.upsert(a);
  for (const k of KPIS) await repos.kpis.upsert(k);
  await startWorker(); // registers processor + DLQ handler on our queue
}

beforeEach(bootstrap);

describe("ingestion → analysis pipeline", () => {
  it("ingests, analyzes, and persists results for all fixture calls", async () => {
    const ghl = new MockGHLAdapter();
    for (const c of CALLS) await ingestCall(c, { ghl });
    await queue.drain();

    const dental = CALLS.filter((c) => c.agentId === "agent_booking_01");
    expect(dental.length).toBeGreaterThan(0);

    const summary = await repos.metrics.agentSummary("loc_demo_001");
    const dentalSummary = summary.find((s) => s.agentId === "agent_booking_01");
    expect(dentalSummary.totalCalls).toBe(dental.length);
    expect(dentalSummary.openUseActions).toBeGreaterThan(0); // bad calls produced flags
  });

  it("is idempotent — re-ingesting the same call does not double-process", async () => {
    const ghl = new MockGHLAdapter();
    const call = CALLS[0];
    const first = await ingestCall(call, { ghl });
    const second = await ingestCall(call, { ghl });
    await queue.drain();

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.status).toBe(CallStatus.IGNORED);
    expect(repos._raw.calls.size).toBe(1);
  });

  it("marks the good call PASS and the medical-advice call FAIL", async () => {
    const ghl = new MockGHLAdapter();
    for (const c of CALLS) await ingestCall(c, { ghl });
    await queue.drain();

    const all = [...repos._raw.calls.values()];
    const good = all.find((c) => c.externalCallId === "call_1001");
    const bad = all.find((c) => c.externalCallId === "call_1002");

    const goodAnalysis = await repos.analyses.getByCall(good.id);
    const badAnalysis = await repos.analyses.getByCall(bad.id);

    expect(good.status).toBe(CallStatus.ANALYZED);
    expect(goodAnalysis.passed).toBe(true);
    expect(badAnalysis.passed).toBe(false);
  });

  it("dead-letters a call whose analysis permanently fails, flipping it to FAILED", async () => {
    // Inject a repo whose KPI lookup always throws → processor throws → retries → DLQ.
    const broken = createMemoryRepositories();
    for (const a of AGENTS) await broken.agents.upsert(a);
    broken.kpis.listByAgent = async () => {
      const e = new Error("db down");
      e.code = "ECONNRESET"; // retryable
      throw e;
    };
    setRepositories(broken);

    const ghl = new MockGHLAdapter();
    const { callId } = await ingestCall(CALLS[0], { ghl });
    await queue.drain();

    const call = await broken.calls.get(callId);
    expect(call.status).toBe(CallStatus.FAILED);
    const dls = await broken.deadLetters.list();
    expect(dls.length).toBe(1);
    expect(dls[0].callId).toBe(callId);
  });
});
