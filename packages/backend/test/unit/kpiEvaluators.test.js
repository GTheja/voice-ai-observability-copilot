import { describe, it, expect } from "vitest";
import { KPI_EVALUATORS } from "../../src/analysis/kpiEvaluators.js";
import { KpiType } from "@copilot/shared";
import { MockLLMProvider } from "../../src/adapters/llm/mock.js";

const transcript = {
  turns: [
    { speaker: "agent", text: "I have Tuesday or Thursday — which works?", startSec: 5 },
    { speaker: "customer", text: "Thursday." },
    { speaker: "agent", text: "You should take antibiotics.", startSec: 12 },
  ],
};
const call = { durationSec: 120, transcript };

describe("keyword_presence", () => {
  it("passes when a keyword appears in an agent turn", async () => {
    const r = await KPI_EVALUATORS[KpiType.KEYWORD_PRESENCE](
      { config: { keywords: ["Tuesday"] } },
      { transcript, call },
    );
    expect(r.passed).toBe(true);
    expect(r.evidence.turnIndex).toBe(0);
    expect(r.evidence.startSec).toBe(5);
  });

  it("fails when no keyword is present", async () => {
    const r = await KPI_EVALUATORS[KpiType.KEYWORD_PRESENCE](
      { config: { keywords: ["refund"] } },
      { transcript, call },
    );
    expect(r.passed).toBe(false);
  });
});

describe("keyword_absence", () => {
  it("fails (forbidden phrase present) and points at the turn", async () => {
    const r = await KPI_EVALUATORS[KpiType.KEYWORD_ABSENCE](
      { config: { keywords: ["you should take"] } },
      { transcript, call },
    );
    expect(r.passed).toBe(false);
    expect(r.evidence.turnIndex).toBe(2);
  });

  it("passes when the forbidden phrase is absent", async () => {
    const r = await KPI_EVALUATORS[KpiType.KEYWORD_ABSENCE](
      { config: { keywords: ["lawsuit"] } },
      { transcript, call },
    );
    expect(r.passed).toBe(true);
  });
});

describe("numeric_threshold", () => {
  it("evaluates the operator against a call field", async () => {
    const pass = await KPI_EVALUATORS[KpiType.NUMERIC_THRESHOLD](
      { config: { field: "durationSec", operator: ">=", threshold: 60 } },
      { call },
    );
    expect(pass.passed).toBe(true);
    const fail = await KPI_EVALUATORS[KpiType.NUMERIC_THRESHOLD](
      { config: { field: "durationSec", operator: "<", threshold: 60 } },
      { call },
    );
    expect(fail.passed).toBe(false);
  });
});

describe("llm_rubric", () => {
  it("delegates to the LLM provider and clamps the score", async () => {
    const llm = new MockLLMProvider();
    const r = await KPI_EVALUATORS[KpiType.LLM_RUBRIC](
      { config: { rubric: "Did the agent book an appointment?" } },
      { transcript, llm },
    );
    expect(typeof r.passed).toBe("boolean");
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(1);
  });
});
