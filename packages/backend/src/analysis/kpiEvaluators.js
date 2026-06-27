// KPI evaluators registry. Each evaluator is a pure function (except llm_rubric, which is
// async and needs the provider). Adding a new KPI type = add an entry here. Nothing else
// in the engine changes — that is the extensibility contract.
import { KpiType } from "@copilot/shared";

// Helpers ---------------------------------------------------------------------
const agentText = (transcript) =>
  transcript.turns
    .filter((t) => t.speaker === "agent")
    .map((t) => t.text)
    .join("\n");

const fullText = (transcript) => transcript.turns.map((t) => `${t.speaker}: ${t.text}`).join("\n");

// Returns {turnIndex, excerpt} for the first agent turn containing any keyword.
function findKeywordTurn(transcript, keywords) {
  const ks = keywords.map((k) => k.toLowerCase());
  for (let i = 0; i < transcript.turns.length; i++) {
    const turn = transcript.turns[i];
    if (turn.speaker !== "agent") continue;
    const lower = turn.text.toLowerCase();
    if (ks.some((k) => lower.includes(k))) {
      return { turnIndex: i, excerpt: turn.text, startSec: turn.startSec };
    }
  }
  return null;
}

// Each evaluator returns: { passed, score(0..1), evidence }
export const KPI_EVALUATORS = {
  [KpiType.KEYWORD_PRESENCE]: (kpi, { transcript }) => {
    const hit = findKeywordTurn(transcript, kpi.config.keywords || []);
    return {
      passed: !!hit,
      score: hit ? 1 : 0,
      evidence: hit
        ? { turnIndex: hit.turnIndex, excerpt: hit.excerpt, startSec: hit.startSec }
        : { note: "no required keyword found in agent turns" },
    };
  },

  [KpiType.KEYWORD_ABSENCE]: (kpi, { transcript }) => {
    const hit = findKeywordTurn(transcript, kpi.config.keywords || []);
    // Passing means the forbidden phrase is ABSENT.
    return {
      passed: !hit,
      score: hit ? 0 : 1,
      evidence: hit
        ? { turnIndex: hit.turnIndex, excerpt: hit.excerpt, startSec: hit.startSec, note: "forbidden phrase present" }
        : { note: "no forbidden phrase detected" },
    };
  },

  [KpiType.BOOLEAN]: (kpi, { call }) => {
    // Reads a boolean from call metadata, e.g. config.field = "metadata.booked".
    const field = kpi.config.field || "";
    const val = field.split(".").reduce((o, k) => (o == null ? o : o[k]), { call, ...call });
    const passed = Boolean(val);
    return { passed, score: passed ? 1 : 0, evidence: { field, value: val ?? null } };
  },

  [KpiType.NUMERIC_THRESHOLD]: (kpi, { call }) => {
    const { threshold = 0, operator = ">=", field = "durationSec" } = kpi.config;
    const value = Number(call[field] ?? 0);
    const ops = {
      ">=": value >= threshold,
      "<=": value <= threshold,
      ">": value > threshold,
      "<": value < threshold,
      "==": value === threshold,
    };
    const passed = !!ops[operator];
    return { passed, score: passed ? 1 : 0, evidence: { field, value, operator, threshold } };
  },

  // Async: delegates the judgment to the LLM with a strict JSON contract.
  [KpiType.LLM_RUBRIC]: async (kpi, { transcript, llm }) => {
    const prompt = [
      "TASK: SCORE_RUBRIC",
      `RUBRIC: ${kpi.config.rubric}`,
      "Score whether the rubric is satisfied by the agent in this transcript.",
      'Respond as JSON: {"passed": boolean, "score": number(0..1), "rationale": string}',
      "TRANSCRIPT:",
      fullText(transcript),
    ].join("\n");
    const res = await llm.completeJSON(prompt);
    return {
      passed: !!res.passed,
      score: typeof res.score === "number" ? Math.max(0, Math.min(1, res.score)) : res.passed ? 1 : 0,
      evidence: { rationale: res.rationale || "" },
    };
  },
};

export function isLLMKpi(kpi) {
  return kpi.type === KpiType.LLM_RUBRIC;
}

export { agentText, fullText };
