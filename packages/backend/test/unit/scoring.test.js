import { describe, it, expect } from "vitest";
import { computeOverall, deriveUseActions } from "../../src/analysis/scoring.js";
import { Severity, UseActionKind } from "@copilot/shared";

describe("computeOverall", () => {
  it("returns full score for an empty KPI set", () => {
    expect(computeOverall([])).toEqual({ overallScore: 100, passed: true });
  });

  it("computes a weighted average", () => {
    const results = [
      { passed: true, score: 1, weight: 0.5, severity: "medium" },
      { passed: false, score: 0, weight: 0.5, severity: "medium" },
    ];
    const { overallScore, passed } = computeOverall(results);
    expect(overallScore).toBe(50);
    expect(passed).toBe(false); // below 70 threshold
  });

  it("passes when weighted score >= 70 and no critical failure", () => {
    const results = [
      { passed: true, score: 1, weight: 0.8, severity: "high" },
      { passed: false, score: 0, weight: 0.2, severity: "low" },
    ];
    const { overallScore, passed } = computeOverall(results);
    expect(overallScore).toBe(80);
    expect(passed).toBe(true);
  });

  it("hard-fails on a critical KPI failure regardless of score", () => {
    const results = [
      { passed: true, score: 1, weight: 0.95, severity: "high" },
      { passed: false, score: 0, weight: 0.05, severity: Severity.CRITICAL },
    ];
    const { passed } = computeOverall(results);
    expect(passed).toBe(false);
  });
});

describe("deriveUseActions", () => {
  it("creates an action per failing KPI, severity-ordered", () => {
    const results = [
      { key: "a", label: "A", passed: false, severity: "medium", evidence: { turnIndex: 1, excerpt: "x" } },
      { key: "b", label: "B", passed: false, severity: Severity.CRITICAL, evidence: { note: "forbidden" } },
    ];
    const actions = deriveUseActions(results, { callId: "c1" });
    expect(actions).toHaveLength(2);
    expect(actions[0].severity).toBe(Severity.CRITICAL); // critical first
    expect(actions[0].kind).toBe(UseActionKind.COMPLIANCE);
    expect(actions[1].kind).toBe(UseActionKind.SCRIPT_TRAINING); // has a turn index
    expect(actions[0].callId).toBe("c1");
  });

  it("ignores passing KPIs", () => {
    const actions = deriveUseActions([{ key: "a", label: "A", passed: true }], { callId: "c1" });
    expect(actions).toHaveLength(0);
  });
});
