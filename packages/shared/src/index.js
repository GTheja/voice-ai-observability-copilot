// Shared domain enums, constants, and zod schemas used by both backend and (typed) frontend.
import { z } from "zod";

// ─── Enums ───────────────────────────────────────────────────────────────────
export const CallStatus = Object.freeze({
  RECEIVED: "received",
  QUEUED: "queued",
  ANALYZING: "analyzing",
  ANALYZED: "analyzed",
  RETRY_SCHEDULED: "retry_scheduled",
  FAILED: "failed",
  IGNORED: "ignored",
});

export const KpiType = Object.freeze({
  BOOLEAN: "boolean",
  NUMERIC_THRESHOLD: "numeric_threshold",
  KEYWORD_PRESENCE: "keyword_presence",
  KEYWORD_ABSENCE: "keyword_absence",
  LLM_RUBRIC: "llm_rubric",
});

export const Severity = Object.freeze({
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  CRITICAL: "critical",
});

export const UseActionKind = Object.freeze({
  HUMAN_REVIEW: "human_review",
  SCRIPT_TRAINING: "script_training",
  ESCALATION: "escalation",
  COMPLIANCE: "compliance",
});

// ─── Schemas ─────────────────────────────────────────────────────────────────
export const TranscriptTurnSchema = z.object({
  speaker: z.enum(["agent", "customer", "system"]),
  text: z.string(),
  // seconds from call start; enables "Use Action" deep-linking into the recording
  startSec: z.number().nonnegative().optional(),
  endSec: z.number().nonnegative().optional(),
});

export const TranscriptSchema = z.object({
  turns: z.array(TranscriptTurnSchema).min(1),
});

// Inbound webhook / call payload from GHL (normalized shape the adapter must produce).
export const CallPayloadSchema = z.object({
  provider: z.string().default("ghl"),
  locationId: z.string().min(1),
  agentId: z.string().min(1),
  callId: z.string().min(1),
  startedAt: z.string().datetime().optional(),
  durationSec: z.number().nonnegative().optional(),
  direction: z.enum(["inbound", "outbound"]).optional(),
  outcome: z.string().optional(), // e.g. "booked", "no_answer", "voicemail"
  transcript: TranscriptSchema,
  metadata: z.record(z.any()).default({}),
});

export const KpiDefinitionSchema = z.object({
  id: z.string().optional(),
  agentId: z.string(),
  key: z.string().min(1), // machine name, e.g. "booked_appointment"
  label: z.string().min(1),
  type: z.nativeEnum(KpiType),
  // type-specific config
  config: z
    .object({
      keywords: z.array(z.string()).optional(),
      threshold: z.number().optional(),
      operator: z.enum([">=", "<=", ">", "<", "=="]).optional(),
      rubric: z.string().optional(), // natural-language criterion for llm_rubric
      weight: z.number().min(0).max(1).default(0.5),
    })
    .default({}),
  severity: z.nativeEnum(Severity).default(Severity.MEDIUM),
  enabled: z.boolean().default(true),
});

export const idempotencyKey = (p) => `${p.provider}:${p.callId}`;

export default {
  CallStatus,
  KpiType,
  Severity,
  UseActionKind,
  TranscriptTurnSchema,
  TranscriptSchema,
  CallPayloadSchema,
  KpiDefinitionSchema,
  idempotencyKey,
};
