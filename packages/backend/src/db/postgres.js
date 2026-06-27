// PostgreSQL repository implementation. Same interface as createMemoryRepositories().
import { query, withTransaction, closePool } from "./pg.js";
import { CallStatus } from "@copilot/shared";

const one = (r) => r.rows[0] || null;
const all = (r) => r.rows;

export function createPostgresRepositories() {
  const agents = {
    async upsert(a) {
      return one(
        await query(
          `INSERT INTO agents (id, location_id, name, goal)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, goal=EXCLUDED.goal, updated_at=now()
           RETURNING *`,
          [a.id, a.locationId, a.name, a.goal || null],
        ),
      );
    },
    async get(id) {
      return one(await query("SELECT * FROM agents WHERE id=$1", [id]));
    },
    async listByLocation(locationId) {
      return all(await query("SELECT * FROM agents WHERE location_id=$1 ORDER BY name", [locationId]));
    },
  };

  const kpis = {
    async listByAgent(agentId) {
      return all(
        await query("SELECT * FROM kpi_definitions WHERE agent_id=$1 AND enabled ORDER BY key", [
          agentId,
        ]),
      );
    },
    async upsert(d) {
      return one(
        await query(
          `INSERT INTO kpi_definitions (agent_id, key, label, type, config, severity, enabled)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (agent_id, key) DO UPDATE SET
             label=EXCLUDED.label, type=EXCLUDED.type, config=EXCLUDED.config,
             severity=EXCLUDED.severity, enabled=EXCLUDED.enabled
           RETURNING *`,
          [d.agentId, d.key, d.label, d.type, d.config || {}, d.severity || "medium", d.enabled ?? true],
        ),
      );
    },
  };

  const calls = {
    async insertReceived(payload, idemKey) {
      // ON CONFLICT DO NOTHING => duplicate detection without a race.
      const inserted = one(
        await query(
          `INSERT INTO calls
            (idempotency_key, provider, location_id, agent_id, external_call_id, status,
             direction, outcome, duration_sec, started_at, transcript, metadata)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           ON CONFLICT (idempotency_key) DO NOTHING
           RETURNING *`,
          [
            idemKey, payload.provider, payload.locationId, payload.agentId, payload.callId,
            CallStatus.RECEIVED, payload.direction || null, payload.outcome || null,
            payload.durationSec ?? null, payload.startedAt || null, payload.transcript,
            payload.metadata || {},
          ],
        ),
      );
      if (inserted) return { call: inserted, duplicate: false };
      const existing = one(await query("SELECT * FROM calls WHERE idempotency_key=$1", [idemKey]));
      return { call: existing, duplicate: true };
    },
    async get(id) {
      return one(await query("SELECT * FROM calls WHERE id=$1", [id]));
    },
    async updateStatus(id, status, { lastError = null } = {}) {
      return one(
        await query(
          "UPDATE calls SET status=$2, last_error=$3, updated_at=now() WHERE id=$1 RETURNING *",
          [id, status, lastError],
        ),
      );
    },
    async incrementAttempt(id) {
      return one(
        await query("UPDATE calls SET attempts=attempts+1, updated_at=now() WHERE id=$1 RETURNING *", [
          id,
        ]),
      );
    },
    async listByLocation(locationId, { limit = 50 } = {}) {
      return all(
        await query(
          "SELECT * FROM calls WHERE location_id=$1 ORDER BY created_at DESC LIMIT $2",
          [locationId, limit],
        ),
      );
    },
  };

  const analyses = {
    async save({ analysis, recommendations = [], useActions = [] }) {
      return withTransaction(async (client) => {
        const a = one(
          await client.query(
            `INSERT INTO analyses
              (call_id, agent_id, overall_score, passed, kpi_results, summary, llm_used, prompt_version)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             ON CONFLICT (call_id) DO UPDATE SET
               overall_score=EXCLUDED.overall_score, passed=EXCLUDED.passed,
               kpi_results=EXCLUDED.kpi_results, summary=EXCLUDED.summary,
               llm_used=EXCLUDED.llm_used, prompt_version=EXCLUDED.prompt_version
             RETURNING *`,
            [
              analysis.callId, analysis.agentId, analysis.overallScore, analysis.passed,
              JSON.stringify(analysis.kpiResults || []), analysis.summary || null,
              analysis.llmUsed || false, analysis.promptVersion || null,
            ],
          ),
        );
        for (const r of recommendations) {
          await client.query(
            `INSERT INTO recommendations (analysis_id, agent_id, kpi_key, title, body, severity)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [a.id, analysis.agentId, r.kpiKey || null, r.title, r.body, r.severity || "medium"],
          );
        }
        for (const u of useActions) {
          await client.query(
            `INSERT INTO use_actions
              (analysis_id, call_id, agent_id, kind, severity, reason, turn_index, start_sec, end_sec, excerpt)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [
              a.id, analysis.callId, analysis.agentId, u.kind, u.severity || "medium",
              u.reason, u.turnIndex ?? null, u.startSec ?? null, u.endSec ?? null, u.excerpt || null,
            ],
          );
        }
        return a;
      });
    },
    async getByCall(callId) {
      return one(await query("SELECT * FROM analyses WHERE call_id=$1", [callId]));
    },
    async listByAgent(agentId) {
      return all(
        await query("SELECT * FROM analyses WHERE agent_id=$1 ORDER BY created_at DESC", [agentId]),
      );
    },
  };

  const recommendations = {
    async listByAgent(agentId, { limit = 50 } = {}) {
      return all(
        await query(
          "SELECT * FROM recommendations WHERE agent_id=$1 ORDER BY created_at DESC LIMIT $2",
          [agentId, limit],
        ),
      );
    },
  };

  const useActions = {
    async listByAgent(agentId, { resolved } = {}) {
      if (resolved === undefined)
        return all(
          await query("SELECT * FROM use_actions WHERE agent_id=$1 ORDER BY created_at DESC", [agentId]),
        );
      return all(
        await query(
          "SELECT * FROM use_actions WHERE agent_id=$1 AND resolved=$2 ORDER BY created_at DESC",
          [agentId, resolved],
        ),
      );
    },
    async resolve(id) {
      return one(
        await query("UPDATE use_actions SET resolved=true WHERE id=$1 RETURNING *", [id]),
      );
    },
  };

  const deadLetters = {
    async create(dl) {
      return one(
        await query(
          `INSERT INTO dead_letters (call_id, job_name, payload, error, attempts)
           VALUES ($1,$2,$3,$4,$5) RETURNING *`,
          [dl.callId || null, dl.jobName, dl.payload, dl.error, dl.attempts],
        ),
      );
    },
    async list() {
      return all(
        await query("SELECT * FROM dead_letters WHERE replayed_at IS NULL ORDER BY created_at DESC"),
      );
    },
    async markReplayed(id) {
      return one(
        await query("UPDATE dead_letters SET replayed_at=now() WHERE id=$1 RETURNING *", [id]),
      );
    },
  };

  const tokens = {
    async upsert(t) {
      return one(
        await query(
          `INSERT INTO oauth_tokens
             (location_id, company_id, user_type, access_token, refresh_token, scope, expires_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (location_id) DO UPDATE SET
             company_id=EXCLUDED.company_id, user_type=EXCLUDED.user_type,
             access_token=EXCLUDED.access_token, refresh_token=EXCLUDED.refresh_token,
             scope=EXCLUDED.scope, expires_at=EXCLUDED.expires_at, updated_at=now()
           RETURNING *`,
          [t.locationId, t.companyId || null, t.userType || null, t.accessToken, t.refreshToken, t.scope || null, t.expiresAt],
        ),
      );
    },
    async get(locationId) {
      return one(await query("SELECT * FROM oauth_tokens WHERE location_id=$1", [locationId]));
    },
  };

  const metrics = {
    async agentSummary(locationId) {
      return all(
        await query(
          `SELECT a.id AS "agentId", a.name,
                  COUNT(an.id)::int AS "totalCalls",
                  AVG(an.overall_score)::numeric(5,1) AS "avgScore",
                  (COUNT(an.id) FILTER (WHERE an.passed))::float / NULLIF(COUNT(an.id),0) AS "passRate",
                  COALESCE(ua.open,0) AS "openUseActions"
           FROM agents a
           LEFT JOIN analyses an ON an.agent_id = a.id
           LEFT JOIN (
             SELECT agent_id, COUNT(*) AS open FROM use_actions WHERE resolved=false GROUP BY agent_id
           ) ua ON ua.agent_id = a.id
           WHERE a.location_id = $1
           GROUP BY a.id, a.name, ua.open
           ORDER BY a.name`,
          [locationId],
        ),
      );
    },
  };

  return {
    driver: "postgres",
    agents, kpis, calls, analyses, recommendations, useActions, deadLetters, tokens, metrics,
    async close() {
      await closePool();
    },
  };
}
