# Voice AI Observability Copilot

An **Agent Observability Copilot** for HighLevel (GHL) Voice AI agents. It automates the
**Monitor** and **Analyze** phases: it ingests call transcripts, scores them against
per‑agent KPIs, and produces concrete prompt/script **recommendations** plus **Use Actions**
(call segments that need a human). It is the "Validation Flywheel" — raw logs in, actionable
insight out, with no manual transcript review.

> **Stack:** Node.js backend · Vue 3 frontend · PostgreSQL · Redis/BullMQ ·
> provider‑agnostic LLM (OpenAI / Anthropic / deterministic mock).
> Full design rationale lives in [`ARCHITECTURE.md`](./ARCHITECTURE.md).

---

## What it does

- **Monitor** — ingests transcripts via webhook or backfill poll, stores them durably and
  idempotently, and evaluates each call against the agent's success criteria (KPIs).
- **Analyze** — a unified dashboard shows pass‑rates and failing calls across all agents,
  surfaces AI recommendations for the failures, and lists Use Actions deep‑linked to the
  exact transcript turn.

KPI types supported out of the box: `keyword_presence`, `keyword_absence`,
`numeric_threshold`, `boolean`, and `llm_rubric` (LLM‑judged criteria). Adding a new type is
one entry in a registry — see `analysis/kpiEvaluators.js`.

---

## Quick start (zero external services)

The fastest way to see it work — no Postgres, no Redis, no API keys:

```bash
npm install
npm run seed --workspace @copilot/backend  # seeds demo agents, KPIs, and 5 transcripts
# in two terminals (or use the combined dev script):
npm run dev:mock
```

`dev:mock` sets `GHL_ADAPTER=mock LLM_PROVIDER=mock QUEUE_DRIVER=memory DB_DRIVER=memory`,
runs the API + worker in one process, and serves the Vue dashboard.

- Dashboard: <http://localhost:5173>
- API health: <http://localhost:8080/health>

> The mock LLM is deterministic, so the demo is reproducible. Deterministic KPIs (keyword /
> numeric / compliance checks) are fully real even in mock mode.

---

## Full stack (Postgres + Redis, production‑like)

```bash
cp .env.example .env          # set LLM_PROVIDER + key for real recommendations
docker compose up -d postgres redis
npm install
npm run migrate --workspace @copilot/backend
npm run seed    --workspace @copilot/backend

# terminal 1 — API
npm run start:api  --workspace @copilot/backend
# terminal 2 — one or more analysis workers (scale horizontally)
npm run start:worker --workspace @copilot/backend
# terminal 3 — dashboard
npm run dev --workspace @copilot/frontend
```

Or run everything in containers:

```bash
docker compose up --build
```

To use a real LLM, set in `.env`:

```ini
LLM_PROVIDER=openai          # or anthropic
OPENAI_API_KEY=sk-...
```

---

## Installing inside a HighLevel sandbox

1. Create a sandbox sub‑account from the HighLevel Marketplace.
2. Build the frontend: `npm run build --workspace @copilot/frontend` → `packages/frontend/dist`.
   Host that folder anywhere static (or the bundled `frontend` container).
3. In the sub‑account, add the snippet from [`docs/ghl-custom-js.html`](./docs/ghl-custom-js.html)
   to **Settings → Custom JS/CSS** (or a Custom Menu Link). It mounts the dashboard in an
   iframe and passes the active `locationId` + a scoped API token so the app is scoped to the
   customer account.
4. Point GHL Voice AI **webhooks** at `POST https://<your-api>/webhooks/ghl`. The real adapter
   verifies each webhook with an HMAC signature (`GHL_WEBHOOK_SECRET`).
5. For a Marketplace app install, set the app's OAuth redirect URL to
   `https://<your-app>/oauth/callback` and the webhook URL to
   `https://<your-app>/webhooks/ghl`. `GET /oauth/install` starts the authorization-code
   flow; `GET /oauth/callback` exchanges and stores the location grant.
6. Switch the backend to live data with `GHL_ADAPTER=real` and the GHL OAuth credentials in
   `.env`.

---

## API surface (selected)

| Method | Path | Purpose |
|---|---|---|
| POST | `/webhooks/ghl` | Inbound transcript (HMAC‑verified), async‑accepted (202) |
| POST | `/api/ingest` | Manual transcript ingest (demo/testing) |
| POST | `/api/poll` | Backfill: pull calls from GHL for a location |
| GET  | `/api/metrics/summary?locationId=` | Dashboard roll‑up across agents |
| GET/PUT | `/api/agents/:id/kpis` | Read / configure observability parameters |
| GET  | `/api/agents/:id/use-actions` | Segments needing human review |
| GET  | `/api/agents/:id/recommendations` | AI prompt/script fixes |
| GET  | `/api/calls/:id` | Call + full analysis + transcript |
| GET  | `/api/dead-letters` · POST `/api/dead-letters/:id/replay` | Ops: inspect & replay failures |

All `/api/*` routes require `Authorization: Bearer <API_BEARER_TOKEN>`.

---

## Testing

```bash
npm run test --workspace @copilot/backend
```

32 tests covering: retry/backoff math, KPI evaluators, OAuth URL/callback behavior,
scoring + use‑action derivation, the
analysis engine (happy path, failing call, **graceful LLM‑down degradation**), and a full
**integration** test of `ingest → queue → worker → persist` including idempotency and the
dead‑letter path. The suite uses the in‑memory drivers, so it runs with no Postgres/Redis.

---

## How "Team of One" ownership was handled

This was built solo across all four hats:

- **Product** — scoped the two loops (Monitor/Analyze) to the highest‑leverage slice: close
  the loop from transcript to recommendation. Chose the "Validation Flywheel" framing and
  picked KPI types that map to how Voice AI agents actually fail (missed booking ask, skipped
  insurance check, compliance violations like giving medical advice).
- **Design** — a master‑detail dashboard (agent roster → metrics, charts, use‑actions,
  recommendations, transcript drawer). Use Actions are severity‑sorted and deep‑link to the
  offending turn so a human knows exactly where to look. Built to embed cleanly in the GHL
  iframe (light footprint, GHL‑like visual language).
- **Engineering** — hexagonal architecture (ports/adapters) so GHL and the LLM are swappable;
  durable, idempotent ingestion; a retrying/back‑off queue with a dead‑letter path; graceful
  degradation so an LLM outage never loses a call. See `ARCHITECTURE.md`.
- **QA** — typed errors drive retry decisions; the engine is unit‑tested including the
  failure modes; an integration test exercises the whole pipeline end‑to‑end on the
  in‑memory stack; a deterministic mock LLM makes the demo reproducible.

---

## Functional vs. mocked

**Functional (real):**
- Transcript ingestion (webhook + poll), idempotency, the durable call lifecycle.
- The async queue: retries, exponential backoff with jitter, dead‑letter capture + replay.
- The analysis engine and all deterministic KPI evaluators (keyword/numeric/compliance).
- Scoring, use‑action derivation, recommendation orchestration, REST API, and the Vue
  dashboard.
- Real LLM recommendations + rubric KPIs when `LLM_PROVIDER=openai|anthropic` with a key.
- Postgres persistence + migrations; Redis/BullMQ queue.

**Mocked / stubbed (by design, swappable):**
- **GHL data** — `MockGHLAdapter` serves realistic fixture agents/transcripts. The real
  adapter can use persisted OAuth grants for live calls; the demo uses seeded transcripts
  when a sandbox has no Voice AI call history yet.
- **LLM** — `MockLLMProvider` returns deterministic results so the demo/tests don't depend on
  a network or a key. Flip one env var for real models.
- The default `dev:mock` profile also swaps Postgres/Redis for in‑memory equivalents so the
  whole thing runs with `npm run dev:mock` and nothing else installed.

---

## Repo layout

```
packages/
  shared/            zod schemas + enums shared across backend/frontend
  backend/
    src/
      adapters/ghl/  GHL port: mock + real-ready
      adapters/llm/  LLM port: mock + openai + anthropic
      analysis/      engine, KPI evaluators, scoring, recommendations, processor
      api/           express routes + middleware
      db/            schema, migrations, postgres + memory repositories
      ingestion/     webhook/poll ingestion service
      queue/         BullMQ + in-memory queue drivers
      lib/           logger, typed errors, retry/backoff
    test/            unit + integration (vitest)
  frontend/          Vue 3 + Vite + Pinia dashboard
docs/ghl-custom-js.html   HighLevel embed snippet
docker-compose.yml        postgres + redis + api + workers + frontend
```
