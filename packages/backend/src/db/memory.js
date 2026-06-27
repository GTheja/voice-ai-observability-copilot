// In-memory repository implementation. Mirrors the Postgres repo interface exactly so
// integration tests (and `npm run dev:mock`) run with zero external services.
import { randomUUID } from "node:crypto";
import { CallStatus } from "@copilot/shared";

export function createMemoryRepositories() {
  const db = {
    agents: new Map(),
    kpis: [],
    calls: new Map(),
    callsByIdem: new Map(),
    analyses: new Map(), // by call_id
    recommendations: [],
    useActions: [],
    deadLetters: [],
    tokens: new Map(), // by location_id
  };

  const tokens = {
    async upsert(t) {
      const row = { ...db.tokens.get(t.locationId), ...t, updatedAt: new Date() };
      db.tokens.set(t.locationId, row);
      return row;
    },
    async get(locationId) {
      return db.tokens.get(locationId) || null;
    },
  };

  const agents = {
    async upsert(a) {
      const existing = db.agents.get(a.id) || {};
      const row = { createdAt: new Date(), ...existing, ...a, updatedAt: new Date() };
      db.agents.set(a.id, row);
      return row;
    },
    async get(id) {
      return db.agents.get(id) || null;
    },
    async listByLocation(locationId) {
      return [...db.agents.values()].filter((a) => a.locationId === locationId);
    },
  };

  const kpis = {
    async listByAgent(agentId) {
      return db.kpis.filter((k) => k.agentId === agentId && k.enabled);
    },
    async upsert(def) {
      const idx = db.kpis.findIndex((k) => k.agentId === def.agentId && k.key === def.key);
      const row = { id: def.id || randomUUID(), enabled: true, ...def };
      if (idx >= 0) db.kpis[idx] = { ...db.kpis[idx], ...row };
      else db.kpis.push(row);
      return row;
    },
  };

  const calls = {
    // Idempotent insert: returns {call, duplicate}
    async insertReceived(payload, idemKey) {
      if (db.callsByIdem.has(idemKey)) {
        return { call: db.calls.get(db.callsByIdem.get(idemKey)), duplicate: true };
      }
      const id = randomUUID();
      const row = {
        id,
        idempotencyKey: idemKey,
        provider: payload.provider,
        locationId: payload.locationId,
        agentId: payload.agentId,
        externalCallId: payload.callId,
        status: CallStatus.RECEIVED,
        direction: payload.direction || null,
        outcome: payload.outcome || null,
        durationSec: payload.durationSec ?? null,
        startedAt: payload.startedAt || null,
        transcript: payload.transcript,
        metadata: payload.metadata || {},
        attempts: 0,
        lastError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      db.calls.set(id, row);
      db.callsByIdem.set(idemKey, id);
      return { call: row, duplicate: false };
    },
    async get(id) {
      return db.calls.get(id) || null;
    },
    async updateStatus(id, status, { lastError = null } = {}) {
      const c = db.calls.get(id);
      if (!c) return null;
      c.status = status;
      c.lastError = lastError;
      c.updatedAt = new Date();
      return c;
    },
    async incrementAttempt(id) {
      const c = db.calls.get(id);
      if (c) c.attempts += 1;
      return c;
    },
    async listByLocation(locationId, { limit = 50 } = {}) {
      return [...db.calls.values()]
        .filter((c) => c.locationId === locationId)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, limit);
    },
  };

  const analyses = {
    // Persist analysis + recommendations + use_actions atomically (single op in memory).
    async save({ analysis, recommendations = [], useActions = [] }) {
      const id = analysis.id || randomUUID();
      const row = { id, ...analysis, createdAt: new Date() };
      db.analyses.set(analysis.callId, row);
      recommendations.forEach((r) =>
        db.recommendations.push({ id: randomUUID(), analysisId: id, ...r }),
      );
      useActions.forEach((u) =>
        db.useActions.push({ id: randomUUID(), analysisId: id, resolved: false, ...u }),
      );
      return row;
    },
    async getByCall(callId) {
      return db.analyses.get(callId) || null;
    },
    async listByAgent(agentId) {
      return [...db.analyses.values()].filter((a) => a.agentId === agentId);
    },
  };

  const recommendations = {
    async listByAgent(agentId, { limit = 50 } = {}) {
      return db.recommendations.filter((r) => r.agentId === agentId).slice(0, limit);
    },
  };

  const useActions = {
    async listByAgent(agentId, { resolved } = {}) {
      return db.useActions.filter(
        (u) => u.agentId === agentId && (resolved === undefined || u.resolved === resolved),
      );
    },
    async resolve(id) {
      const u = db.useActions.find((x) => x.id === id);
      if (u) u.resolved = true;
      return u || null;
    },
  };

  const deadLetters = {
    async create(dl) {
      const row = { id: randomUUID(), createdAt: new Date(), replayedAt: null, ...dl };
      db.deadLetters.push(row);
      return row;
    },
    async list() {
      return db.deadLetters.filter((d) => !d.replayedAt);
    },
    async markReplayed(id) {
      const d = db.deadLetters.find((x) => x.id === id);
      if (d) d.replayedAt = new Date();
      return d || null;
    },
  };

  const metrics = {
    async agentSummary(locationId) {
      const out = [];
      for (const agent of await agents.listByLocation(locationId)) {
        const ans = await analyses.listByAgent(agent.id);
        const total = ans.length;
        const passed = ans.filter((a) => a.passed).length;
        const avg = total ? ans.reduce((s, a) => s + Number(a.overallScore || 0), 0) / total : 0;
        const open = (await useActions.listByAgent(agent.id, { resolved: false })).length;
        out.push({
          agentId: agent.id,
          name: agent.name,
          totalCalls: total,
          passRate: total ? passed / total : null,
          avgScore: Math.round(avg * 10) / 10,
          openUseActions: open,
        });
      }
      return out;
    },
  };

  return {
    driver: "memory",
    agents,
    kpis,
    calls,
    analyses,
    recommendations,
    useActions,
    deadLetters,
    tokens,
    metrics,
    _raw: db,
    async close() {},
  };
}
