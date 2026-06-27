// Mock GHL adapter — serves fixture agents/calls and accepts unsigned webhooks.
// Implements the exact same interface as RealGHLAdapter, so swapping is a one-liner.
import { AGENTS, CALLS } from "./fixtures.js";
import { CallPayloadSchema } from "@copilot/shared";

export class MockGHLAdapter {
  constructor() {
    this.name = "mock";
  }

  async listAgents(locationId) {
    return AGENTS.filter((a) => a.locationId === locationId);
  }

  async listCalls(locationId, { since } = {}) {
    let calls = CALLS.filter((c) => c.locationId === locationId);
    if (since) calls = calls.filter((c) => new Date(c.startedAt) >= new Date(since));
    return { calls, cursor: null };
  }

  async getCall(locationId, callId) {
    const c = CALLS.find((x) => x.locationId === locationId && x.callId === callId);
    return c || null;
  }

  // Mock accepts everything (no secret in dev).
  verifyWebhook() {
    return true;
  }

  // Normalize an inbound webhook body into our canonical CallPayload.
  parseWebhook(body) {
    return CallPayloadSchema.parse(body);
  }
}
