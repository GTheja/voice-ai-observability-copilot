// Pure scoring + use-action derivation. No I/O — fully unit-testable.
import { Severity, UseActionKind } from "@copilot/shared";

// Weighted 0..100 score. A failed CRITICAL KPI hard-caps the overall pass to false.
export function computeOverall(kpiResults) {
  if (kpiResults.length === 0) return { overallScore: 100, passed: true };

  let weightSum = 0;
  let weighted = 0;
  let criticalFail = false;

  for (const r of kpiResults) {
    const w = clamp01(r.weight ?? 0.5) || 0.01;
    weightSum += w;
    weighted += w * clamp01(r.score);
    if (!r.passed && r.severity === Severity.CRITICAL) criticalFail = true;
  }

  const overallScore = Math.round((weighted / weightSum) * 1000) / 10; // one decimal
  const passed = !criticalFail && overallScore >= 70;
  return { overallScore, passed };
}

// Map failing KPIs to "Use Actions" (segments needing a human / training).
export function deriveUseActions(kpiResults, { callId }) {
  const actions = [];
  for (const r of kpiResults) {
    if (r.passed) continue;
    const ev = r.evidence || {};
    actions.push({
      callId,
      kind: kindFor(r),
      severity: r.severity || Severity.MEDIUM,
      reason: `KPI "${r.label}" failed${ev.note ? ` — ${ev.note}` : ""}${ev.rationale ? ` — ${ev.rationale}` : ""}`,
      turnIndex: ev.turnIndex ?? null,
      startSec: ev.startSec ?? null,
      endSec: ev.endSec ?? null,
      excerpt: ev.excerpt || null,
    });
  }
  // Highest severity first.
  const order = { critical: 0, high: 1, medium: 2, low: 3 };
  return actions.sort((a, b) => order[a.severity] - order[b.severity]);
}

function kindFor(r) {
  if (r.severity === Severity.CRITICAL) return UseActionKind.COMPLIANCE;
  if (r.key && /escalat/i.test(r.key)) return UseActionKind.ESCALATION;
  if (r.evidence?.turnIndex != null) return UseActionKind.SCRIPT_TRAINING;
  return UseActionKind.HUMAN_REVIEW;
}

function clamp01(n) {
  const x = Number(n);
  if (Number.isNaN(x)) return 0;
  return Math.max(0, Math.min(1, x));
}
