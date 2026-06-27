// The analysis engine — the product's core logic.
//
// Pipeline:  evaluate KPIs → score → use-actions → recommendations
//
// Graceful degradation: deterministic KPIs ALWAYS run and are always returned. The LLM
// layer (rubric KPIs + recommendations) is additive; if it fails, we still return a valid,
// partial analysis with `llmUsed=false`, so an LLM outage never loses a call.
import { KPI_EVALUATORS, isLLMKpi } from "./kpiEvaluators.js";
import { computeOverall, deriveUseActions } from "./scoring.js";
import { generateRecommendations, PROMPT_VERSION } from "./recommendations.js";
import { withRetry } from "../lib/retry.js";
import { config } from "../config/index.js";

/**
 * @param {object} args
 * @param {object} args.call        normalized call payload (incl. transcript)
 * @param {object} args.agent       agent (goal/script)
 * @param {Array}  args.kpis        KPI definitions for the agent
 * @param {object} args.llm         LLMProvider
 * @param {object} [args.logger]
 * @returns {Promise<{analysis, recommendations, useActions, llmUsed, degraded}>}
 */
export async function analyzeCall({ call, agent, kpis, llm, logger = console }) {
  const transcript = call.transcript;
  const ctx = { call, transcript, llm };
  const kpiResults = [];
  let llmUsed = false;
  let degraded = false;

  for (const kpi of kpis) {
    const evaluator = KPI_EVALUATORS[kpi.type];
    if (!evaluator) {
      logger.warn?.({ type: kpi.type }, "no evaluator for KPI type; skipping");
      continue;
    }
    try {
      let result;
      if (isLLMKpi(kpi)) {
        // LLM rubric KPI: retry transient LLM failures, then degrade to "unknown→fail-open".
        result = await withRetry(() => evaluator(kpi, ctx), {
          attempts: config.WORKER_MAX_ATTEMPTS,
          baseMs: 500,
          capMs: 8000,
          onRetry: ({ attempt, error }) =>
            logger.warn?.({ attempt, err: error?.message, kpi: kpi.key }, "rubric KPI retry"),
        });
        llmUsed = true;
      } else {
        result = await evaluator(kpi, ctx);
      }
      kpiResults.push({
        key: kpi.key,
        label: kpi.label,
        type: kpi.type,
        severity: kpi.severity,
        weight: kpi.config?.weight ?? 0.5,
        passed: result.passed,
        score: result.score,
        evidence: result.evidence,
      });
    } catch (err) {
      // LLM rubric failed after retries → mark indeterminate (does not crash the analysis).
      degraded = true;
      logger.error?.({ err: err.message, kpi: kpi.key }, "KPI evaluation failed; marking indeterminate");
      kpiResults.push({
        key: kpi.key,
        label: kpi.label,
        type: kpi.type,
        severity: kpi.severity,
        weight: kpi.config?.weight ?? 0.5,
        passed: null,
        score: 0,
        indeterminate: true,
        evidence: { note: "evaluation unavailable (LLM degraded)" },
      });
    }
  }

  // Score from determinate results only.
  const determinate = kpiResults.filter((r) => r.passed !== null);
  const { overallScore, passed } = computeOverall(determinate);

  // Use-actions from failing KPIs.
  const useActions = deriveUseActions(
    kpiResults.filter((r) => r.passed === false),
    { callId: call.id },
  );

  // Recommendations (LLM, additive). Failure degrades gracefully.
  const failedKpis = kpiResults.filter((r) => r.passed === false);
  let recs = { summary: null, recommendations: [] };
  try {
    recs = await withRetry(
      () => generateRecommendations({ llm, agent, transcript, failedKpis }),
      { attempts: config.WORKER_MAX_ATTEMPTS, baseMs: 500, capMs: 8000 },
    );
    if (failedKpis.length > 0) llmUsed = true;
  } catch (err) {
    degraded = true;
    logger.error?.({ err: err.message }, "recommendation generation failed; continuing without it");
    recs.summary = "Scored successfully; AI recommendations temporarily unavailable.";
  }

  const analysis = {
    callId: call.id,
    agentId: agent.id,
    overallScore,
    passed,
    kpiResults,
    summary: recs.summary,
    llmUsed,
    promptVersion: PROMPT_VERSION,
  };

  const recommendations = recs.recommendations.map((r) => ({
    agentId: agent.id,
    kpiKey: r.kpiKey || null,
    title: r.title,
    body: r.body,
    severity: r.severity || "medium",
  }));

  const useActionsWithAgent = useActions.map((u) => ({ ...u, agentId: agent.id }));

  return { analysis, recommendations, useActions: useActionsWithAgent, llmUsed, degraded };
}
