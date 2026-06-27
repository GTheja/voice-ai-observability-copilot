import { describe, it, expect } from "vitest";
import { analyzeCall } from "../../src/analysis/engine.js";
import { MockLLMProvider } from "../../src/adapters/llm/mock.js";
import { AGENTS, KPIS, CALLS } from "../../src/adapters/ghl/fixtures.js";

const agent = AGENTS[0]; // dental booking
const kpis = KPIS.filter((k) => k.agentId === agent.id);
const goodCall = { ...CALLS.find((c) => c.callId === "call_1001"), id: "uuid-good" };
const badCall = { ...CALLS.find((c) => c.callId === "call_1002"), id: "uuid-bad" };

const silent = { warn() {}, error() {}, info() {} };

describe("analyzeCall — happy path", () => {
  it("passes a compliant call with no use-actions", async () => {
    const { analysis, useActions } = await analyzeCall({
      call: goodCall,
      agent,
      kpis,
      llm: new MockLLMProvider(),
      logger: silent,
    });
    expect(analysis.passed).toBe(true);
    expect(analysis.overallScore).toBeGreaterThanOrEqual(70);
    expect(useActions).toHaveLength(0);
  });
});

describe("analyzeCall — failing call", () => {
  it("flags a critical compliance failure (medical advice) and recommends a fix", async () => {
    const { analysis, useActions, recommendations } = await analyzeCall({
      call: badCall,
      agent,
      kpis,
      llm: new MockLLMProvider(),
      logger: silent,
    });
    expect(analysis.passed).toBe(false);
    const medical = analysis.kpiResults.find((r) => r.key === "no_medical_advice");
    expect(medical.passed).toBe(false);
    expect(useActions.some((u) => u.kind === "compliance")).toBe(true);
    expect(recommendations.length).toBeGreaterThan(0);
  });
});

describe("analyzeCall — graceful degradation", () => {
  it("still scores deterministic KPIs when the LLM is down", async () => {
    const brokenLLM = {
      name: "broken",
      async complete() {
        throw new Error("LLM unavailable");
      },
      async completeJSON() {
        const e = new Error("503 service unavailable");
        e.status = 503;
        throw e;
      },
    };
    const { analysis, degraded } = await analyzeCall({
      call: badCall,
      agent,
      kpis,
      llm: brokenLLM,
      logger: silent,
    });
    expect(degraded).toBe(true);
    // Deterministic critical KPI still evaluated → call still fails, not lost.
    const medical = analysis.kpiResults.find((r) => r.key === "no_medical_advice");
    expect(medical.passed).toBe(false);
    // Rubric KPI is indeterminate, not crashing.
    const rubric = analysis.kpiResults.find((r) => r.type === "llm_rubric");
    expect(rubric.passed).toBeNull();
  });
});
