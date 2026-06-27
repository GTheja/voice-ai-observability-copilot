// Builds the recommendation prompt and parses LLM output. Prompt is versioned so we can
// A/B different recommendation strategies without code churn elsewhere.
import { fullText } from "./kpiEvaluators.js";

export const PROMPT_VERSION = "rec-v1";

export function buildRecommendationPrompt({ agent, transcript, failedKpis }) {
  const failing = failedKpis
    .map((k) => `- ${k.label} (key=${k.key}, severity=${k.severity}): ${k.evidence?.note || k.evidence?.rationale || "failed"}`)
    .join("\n");

  return [
    "TASK: RECOMMENDATIONS",
    `AGENT_GOAL: ${agent.goal || agent.name}`,
    `FAILING_KPI: ${failedKpis[0]?.key || "general"}`,
    "The Voice AI agent failed the following success criteria:",
    failing,
    "",
    "Produce specific, actionable prompt/script changes that would fix these failures.",
    "Ground each recommendation in what actually happened in the transcript.",
    'Respond as JSON: {"summary": string, "recommendations": [{"kpiKey": string, "title": string, "body": string, "severity": "low|medium|high|critical"}]}',
    "",
    "TRANSCRIPT:",
    fullText(transcript),
  ].join("\n");
}

export async function generateRecommendations({ llm, agent, transcript, failedKpis }) {
  if (failedKpis.length === 0) {
    return { summary: "All success criteria met. No changes recommended.", recommendations: [] };
  }
  const prompt = buildRecommendationPrompt({ agent, transcript, failedKpis });
  const res = await llm.completeJSON(prompt);
  return {
    summary: res.summary || "Recommendations generated.",
    recommendations: Array.isArray(res.recommendations) ? res.recommendations : [],
  };
}
