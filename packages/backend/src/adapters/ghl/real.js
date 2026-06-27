// Real GHL adapter — calls the live LeadConnector API. OAuth tokens are populated by the
// install flow (api/oauth.js) and read via the token store (auto-refresh). Webhook HMAC
// verification authenticates inbound real webhooks.
import crypto from "node:crypto";
import { config } from "../../config/index.js";
import { CallPayloadSchema } from "@copilot/shared";
import { withRetry, withTimeout } from "../../lib/retry.js";
import { RetryableError, AppError } from "../../lib/errors.js";
import { getValidAccessToken } from "./tokenStore.js";

export class RealGHLAdapter {
  constructor() {
    this.name = "real";
    this.base = config.GHL_BASE_URL;
  }

  async #token(locationId) {
    // Valid access token for the location, refreshed transparently if near expiry.
    return getValidAccessToken(locationId);
  }

  async #get(path, locationId) {
    return withRetry(async () => {
      const res = await withTimeout(
        fetch(`${this.base}${path}`, {
          headers: {
            Authorization: `Bearer ${await this.#token(locationId)}`,
            Version: config.GHL_API_VERSION,
            Accept: "application/json",
          },
        }),
        config.LLM_TIMEOUT_MS,
        `ghl.get ${path}`,
      );
      if (res.status === 429 || res.status >= 500)
        throw new RetryableError(`GHL transient ${res.status}`);
      if (!res.ok) throw new AppError(`GHL ${res.status}: ${await res.text()}`, { status: res.status });
      return res.json();
    });
  }

  async listAgents(locationId) {
    // Map GHL Voice AI agents response → our Agent shape.
    const data = await this.#get(`/voice-ai/agents?locationId=${locationId}`, locationId);
    return (data.agents || []).map((a) => ({
      id: a.id,
      locationId,
      name: a.name,
      goal: a.prompt || a.description || "",
    }));
  }

  async listCalls(locationId, { since, cursor } = {}) {
    const qs = new URLSearchParams({ locationId, ...(since && { since }), ...(cursor && { cursor }) });
    const data = await this.#get(`/voice-ai/calls?${qs}`, locationId);
    return {
      calls: (data.calls || []).map((c) => this.#normalizeCall(c, locationId)),
      cursor: data.meta?.nextCursor || null,
    };
  }

  async getCall(locationId, callId) {
    const data = await this.#get(`/voice-ai/calls/${callId}?locationId=${locationId}`, locationId);
    return this.#normalizeCall(data, locationId);
  }

  #normalizeCall(c, locationId) {
    return CallPayloadSchema.parse({
      provider: "ghl",
      locationId,
      agentId: c.agentId,
      callId: c.id,
      startedAt: c.startedAt,
      durationSec: c.duration,
      direction: c.direction,
      outcome: c.outcome,
      transcript: { turns: (c.transcript || []).map((m) => ({ speaker: m.role, text: m.message, startSec: m.timestamp })) },
      metadata: { contactId: c.contactId },
    });
  }

  // HMAC-SHA256 verification of the raw request body.
  verifyWebhook(rawBody, signature) {
    if (!config.GHL_WEBHOOK_SECRET) return false;
    const expected = crypto
      .createHmac("sha256", config.GHL_WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");
    try {
      return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature || "")));
    } catch {
      return false;
    }
  }

  parseWebhook(body) {
    return this.#normalizeCall(body, body.locationId);
  }
}
