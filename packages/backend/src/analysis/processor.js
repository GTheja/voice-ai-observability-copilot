// The analysis job processor. Wired to the queue in worker.js. Throwing here triggers the
// queue's retry/backoff; exhaustion triggers the dead-letter handler.
import { CallStatus } from "@copilot/shared";
import { getRepositories } from "../db/index.js";
import { analyzeCall } from "./engine.js";
import { withCorrelation } from "../lib/logger.js";

export function makeAnalysisProcessor({ llm }) {
  return async function process({ data, attemptsMade = 0 }) {
    const { callId } = data;
    const log = withCorrelation(callId);
    const repos = getRepositories();

    const call = await repos.calls.get(callId);
    if (!call) {
      log.warn("call not found; dropping job");
      return; // nothing to retry
    }
    // Idempotent: if already analyzed, skip (handles duplicate deliveries / replays).
    const existing = await repos.analyses.getByCall(callId);
    if (existing && call.status === CallStatus.ANALYZED) {
      log.info("already analyzed; skipping");
      return;
    }

    await repos.calls.updateStatus(callId, CallStatus.ANALYZING);
    await repos.calls.incrementAttempt(callId);

    try {
      const agent = await repos.agents.get(call.agentId);
      const kpis = await repos.kpis.listByAgent(call.agentId);

      const { analysis, recommendations, useActions, degraded } = await analyzeCall({
        call,
        agent,
        kpis,
        llm,
        logger: log,
      });

      await repos.analyses.save({ analysis, recommendations, useActions });
      await repos.calls.updateStatus(callId, CallStatus.ANALYZED);
      log.info({ score: analysis.overallScore, passed: analysis.passed, degraded }, "analysis complete");
      return { callId, score: analysis.overallScore, degraded };
    } catch (err) {
      // Mark for retry; the queue decides whether to retry or dead-letter.
      await repos.calls.updateStatus(callId, CallStatus.RETRY_SCHEDULED, { lastError: err.message });
      log.error({ err: err.message, attemptsMade }, "analysis attempt failed");
      throw err;
    }
  };
}

// Persists a dead-lettered job and flips the call to FAILED so the UI/admin can replay it.
export function makeDeadLetterHandler() {
  return async function deadLetter({ name, data, err, attempts }) {
    const repos = getRepositories();
    await repos.calls.updateStatus(data.callId, CallStatus.FAILED, { lastError: err?.message });
    await repos.deadLetters.create({
      callId: data.callId,
      jobName: name,
      payload: data,
      error: err?.message || "unknown",
      attempts,
    });
  };
}
