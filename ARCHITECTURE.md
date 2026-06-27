# Voice AI Observability Copilot — Architecture

> Automates the **Monitor** and **Analyze** phases for HighLevel (GHL) Voice AI agents.
> Ingests call transcripts, scores them against per‑agent KPIs, and produces actionable
> prompt/script recommendations and "Use Actions" (segments needing human attention).

---

## 1. Goals & Non‑Goals

**Goals**
- Close the loop **raw transcript → KPI evaluation → recommendation** with no manual log review.
- Be **fault tolerant**: a transient LLM/GHL outage must never lose a transcript.
- Be **scalable**: ingestion throughput is decoupled from analysis throughput via a queue.
- Be **extensible**: new KPIs, new LLM providers, and new data sources are drop‑in modules.
- Be **observable about its own observability**: structured logs, metrics, health checks.

**Non‑Goals (this iteration)**
- Live audio streaming / real‑time barge‑in (we operate on post‑call transcripts + webhooks).
- Multi‑tenant billing. Tenancy is modeled (`location_id`) but not metered.

---

## 2. High‑Level Architecture

```
                         ┌─────────────────────────────────────────────┐
                         │             HighLevel (GHL)                   │
                         │  Voice AI Agents · Call transcripts · Webhooks│
                         └───────────────┬───────────────┬──────────────┘
                                         │ webhook        │ poll (backfill)
                                         ▼                ▼
┌──────────────┐   embed (Custom JS / Marketplace iframe)   ┌───────────────────────────┐
│  GHL UI      │◀───────────────────────────────────────────│   Frontend (Vue 3 + Vite) │
│ (customer)   │                                             │   Observability Dashboard │
└──────────────┘                                             └─────────────┬─────────────┘
                                                                           │ REST (JSON)
                                                                           ▼
┌───────────────────────────────────────────────────────────────────────────────────────┐
│                              Backend (Node.js / Express)                                 │
│                                                                                         │
│  ┌────────────┐   enqueue   ┌──────────────┐   reserve   ┌──────────────────────────┐   │
│  │ Ingestion  │────────────▶│  Job Queue   │────────────▶│  Analysis Workers        │   │
│  │ (webhook + │  (idempotent)│ Redis/BullMQ │  (retry +   │  KPI eval + LLM recs     │   │
│  │  poller)   │             │  + DLQ       │   backoff)  │  + use‑action detection  │   │
│  └─────┬──────┘             └──────────────┘             └────────────┬─────────────┘   │
│        │ persist raw                                                   │ persist results  │
│        ▼                                                               ▼                  │
│  ┌──────────────────────────────  PostgreSQL  ─────────────────────────────────────┐    │
│  │ agents · calls · transcripts · kpi_definitions · analyses · recommendations ·    │    │
│  │ use_actions · ingestion_events (idempotency) · dead_letters                      │    │
│  └─────────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                         │
│  Adapters (ports): GHLAdapter (mock | real)   ·   LLMProvider (mock | openai | claude)  │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

The design follows **ports & adapters (hexagonal)**. The core domain (KPI evaluation,
recommendation orchestration) depends only on *interfaces* (`GHLAdapter`, `LLMProvider`,
repositories). Concrete implementations are injected at boot, so swapping the mock GHL for
the real API, or OpenAI for Claude, changes one line of wiring — not the domain code.

---

## 3. The Two Observability Loops

### 3.1 Monitor (Observability)
1. **Ingest** — a transcript arrives via webhook (`POST /webhooks/ghl`) or is pulled by the
   backfill poller (`GHLAdapter.listCalls`). Raw payload is persisted *before* any
   processing, keyed by an idempotency key so duplicates are dropped.
2. **Set parameters** — each agent has a set of `kpi_definitions` (seeded from the agent's
   goal/script, editable in the UI). KPIs are typed: `boolean`, `numeric_threshold`,
   `keyword_presence`, `keyword_absence`, `llm_rubric`.
3. **Detect deviations** — the analysis engine evaluates every KPI against the transcript and
   records pass/fail, score, and evidence (the offending turns).

### 3.2 Analyze (Unified Dashboard)
1. **Visualize** — the dashboard aggregates KPI pass‑rates, failing calls, and trends across
   all agents in one view.
2. **Recommend** — for failing KPIs the LLM produces a concrete prompt/script edit
   ("change line X to Y because…"), grounded in the transcript evidence.
3. **Use Actions** — segments that need a human (e.g., compliance miss, escalation,
   sentiment crash) are flagged with the transcript offset and a suggested action.

---

## 4. Call Lifecycle (state machine)

```
 received ──▶ queued ──▶ analyzing ──▶ analyzed
    │            │           │
    │            │           └─(error, attempts<max)──▶ retry_scheduled ──▶ queued
    │            │           └─(error, attempts=max)──▶ failed ──▶ dead_letter
    └─(duplicate idempotency key)──▶ ignored
```

State is stored on `calls.status`. Transitions are the **only** way status changes, and each
transition is logged with a correlation id. `failed` calls are replayable from the DLQ via an
admin endpoint, so no data is ever stranded.

---

## 5. Fault Tolerance & Retry Strategy

| Failure | Mitigation |
|---|---|
| Duplicate webhook delivery | Idempotency key (`provider + call_id`) unique index; second insert is a no‑op. |
| Transcript persisted but worker crashes | Raw row already in Postgres; job is re‑reserved by BullMQ after `lockDuration`. |
| LLM 429 / 5xx / timeout | `withRetry()` — exponential backoff + full jitter, capped attempts; classifies errors as *retryable* vs *fatal*. |
| LLM persistently down | After max attempts the job lands in the **Dead Letter Queue**; KPI evaluation (deterministic, non‑LLM) still completes so the call is partially analyzed. |
| Postgres blip | Connection pool with retry on acquire; transactions wrap result writes so partial analysis never persists. |
| Poisoned payload | Schema validation (zod) at the edge rejects malformed input with 422 before it touches the queue. |
| Whole worker fleet down | Queue buffers in Redis; jobs drain when workers return. Ingestion stays up independently. |

**Graceful degradation:** the analysis engine runs deterministic KPIs first and *always*
persists them; the LLM layer (recommendations, rubric KPIs) is additive. An LLM outage
degrades to "scored but no AI narrative", never to "lost call".

---

## 6. Scalability

- **Decoupled tiers.** Ingestion (cheap, fast) and analysis (expensive, slow) scale
  independently. Ingestion is stateless behind a load balancer; analysis is `N` worker
  processes pulling from one Redis queue.
- **Concurrency control.** Worker `concurrency` and a BullMQ **rate limiter** cap outbound
  LLM calls to respect provider quotas.
- **Backpressure.** Queue depth is exposed as a metric; autoscaling can target it.
- **Read path.** Dashboard aggregates are served from indexed Postgres views; heavy
  aggregates are materialized and refreshed, keeping the UI snappy under load.
- **Batching.** The poller pages through GHL calls; analysis can batch multiple KPIs into a
  single LLM call to cut token cost and latency.

---

## 7. Extensibility

- **New KPI type** → add an evaluator to the `KPI_EVALUATORS` registry. The engine discovers
  it; no other code changes.
- **New LLM provider** → implement `LLMProvider` (`complete()` / `completeJSON()`) and
  register it. Selected by `LLM_PROVIDER` env var.
- **New data source** (e.g., another voice platform) → implement `GHLAdapter`’s port; the
  ingestion/analysis pipeline is source‑agnostic.
- **New recommendation strategy** → recommendation prompts are versioned templates; A/B a
  new template by bumping `prompt_version`.

---

## 8. Performance

- Deterministic KPIs are pure functions — microseconds, no I/O.
- LLM calls are the bottleneck: mitigated by (a) batching KPIs, (b) caching identical
  transcript→analysis by content hash, (c) streaming not required (async queue hides latency
  from the user).
- DB: every hot query is indexed (`calls(location_id, status, created_at)`,
  `analyses(call_id)`, idempotency unique index). N+1s avoided via join‑based repository reads.

---

## 9. Security & Tenancy

- All data scoped by `location_id` (GHL sub‑account). API requires a bearer token; the GHL
  embed passes the location context.
- Webhook authenticity verified via HMAC signature (`X-GHL-Signature`) in the real adapter.
- Secrets (LLM keys, GHL client secret) only via env; never persisted in code or DB.
- PII: transcripts may contain PII; storage is tenant‑scoped and the LLM adapter supports a
  redaction pre‑pass hook.

---

## 10. Testing Strategy

- **Unit** — KPI evaluators, retry/backoff math, recommendation prompt builder, status
  machine. Pure, fast, no I/O. Deterministic `MockLLMProvider`.
- **Integration** — full ingestion → queue → analysis → persistence flow using the in‑memory
  queue and mock adapters, asserting DB end state and emitted use‑actions.
- **Contract** — adapter interface conformance tests run against both mock and (when keys
  present) real adapters.
- **CI gate** — lint + unit + integration must pass; the analysis engine has the highest
  coverage bar because it is the product’s core logic.

---

## 11. Technology Choices (and why)

| Concern | Choice | Rationale |
|---|---|---|
| Backend | Node.js + Express | Assignment requirement; mature, simple, huge ecosystem. |
| Frontend | Vue 3 + Vite + Pinia | Assignment requirement; fast DX, small bundle for an embedded widget. |
| DB | PostgreSQL | Relational integrity for the call→analysis→recommendation graph; JSONB for flexible payloads. |
| Queue | Redis + BullMQ | Battle‑tested retries, backoff, rate limiting, DLQ out of the box. |
| Validation | Zod | One schema, runtime + types, used at API edge and adapter boundary. |
| Tests | Vitest | Fast, ESM‑native, same runner for unit + integration. |
| Charts | Chart.js (vue‑chartjs) | Lightweight, embeds cleanly inside the GHL iframe. |

A no‑Docker fallback (in‑memory queue + the mock adapters) lets a reviewer run the whole
thing with `npm run dev:mock` and zero external services.
