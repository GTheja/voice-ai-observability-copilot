// Ingestion: validate → persist raw (idempotent) → enqueue. Persisting BEFORE enqueue is
// the durability guarantee: if the process dies between persist and enqueue, a reconcile
// sweep (see reconcile.js) re-enqueues any `received` calls.
import { CallPayloadSchema, idempotencyKey, CallStatus } from "@copilot/shared";
import { ValidationError } from "../lib/errors.js";
import { getRepositories } from "../db/index.js";
import { getQueue } from "../queue/index.js";
import { logger } from "../lib/logger.js";

export async function ingestCall(rawPayload, { ghl } = {}) {
  const parsed = CallPayloadSchema.safeParse(rawPayload);
  if (!parsed.success) {
    throw new ValidationError("invalid call payload", parsed.error.flatten());
  }
  const payload = parsed.data;
  const repos = getRepositories();

  // Ensure the agent exists (pull goal/script from adapter if we can; fall back to id).
  let agent = await repos.agents.get(payload.agentId);
  if (!agent) {
    let fromGhl = null;
    if (ghl) {
      const agents = await ghl.listAgents(payload.locationId).catch(() => []);
      fromGhl = agents.find((a) => a.id === payload.agentId) || null;
    }
    agent = await repos.agents.upsert(
      fromGhl || { id: payload.agentId, locationId: payload.locationId, name: payload.agentId, goal: "" },
    );
  }

  const key = idempotencyKey(payload);
  const { call, duplicate } = await repos.calls.insertReceived(payload, key);
  if (duplicate) {
    logger.info({ callId: call.id, key }, "duplicate call ignored (idempotent)");
    return { callId: call.id, status: CallStatus.IGNORED, duplicate: true };
  }

  const queue = await getQueue();
  await queue.add("analyze", { callId: call.id });
  await repos.calls.updateStatus(call.id, CallStatus.QUEUED);

  logger.info({ callId: call.id, agentId: payload.agentId }, "call ingested + queued");
  return { callId: call.id, status: CallStatus.QUEUED, duplicate: false };
}
