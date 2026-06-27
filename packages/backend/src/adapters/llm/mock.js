// Deterministic LLM provider for local dev and tests.
// It inspects the prompt for the structured task markers our engine emits and returns
// a plausible, *deterministic* JSON response — so tests never depend on a network or
// on model nondeterminism.

export class MockLLMProvider {
  constructor() {
    this.name = "mock";
  }

  async complete(prompt) {
    return `MOCK_COMPLETION:${hash(prompt)}`;
  }

  async completeJSON(prompt) {
    // Rubric scoring task
    if (prompt.includes("TASK: SCORE_RUBRIC")) {
      const pass = !/refus|frustrat|angry|no\b.*help|complian/i.test(prompt);
      return { passed: pass, score: pass ? 0.85 : 0.35, rationale: "mock rubric evaluation" };
    }
    // Recommendation task
    if (prompt.includes("TASK: RECOMMENDATIONS")) {
      return {
        summary: "Agent missed one or more success criteria; targeted script edits suggested.",
        recommendations: [
          {
            kpiKey: extract(prompt, "FAILING_KPI") || "general",
            title: "Tighten the booking ask",
            body:
              "Add an explicit calendar offer after qualifying the lead, e.g. " +
              "\"I have Tuesday 2pm or Thursday 10am — which works?\" to reduce drop-off.",
            severity: "high",
          },
        ],
      };
    }
    return {};
  }
}

function extract(text, label) {
  const m = text.match(new RegExp(`${label}:\\s*([\\w-]+)`));
  return m ? m[1] : null;
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}
