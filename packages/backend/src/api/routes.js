import { Router } from "express";
import { z } from "zod";
import { KpiDefinitionSchema } from "@copilot/shared";
import { asyncHandler, requireAuth } from "./middleware.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import { getRepositories } from "../db/index.js";
import { ingestCall } from "../ingestion/service.js";
import { pollLocation } from "../ingestion/poller.js";
import { getQueue } from "../queue/index.js";

export function buildRouter({ ghl }) {
  const router = Router();
  const repos = () => getRepositories();

  // ── Webhook (no bearer; authenticated via HMAC in the real adapter) ──────────
  router.post(
    "/webhooks/ghl",
    asyncHandler(async (req, res) => {
      const signature = req.headers["x-ghl-signature"];
      if (!ghl.verifyWebhook(req.rawBody || JSON.stringify(req.body), signature)) {
        return res.status(401).json({ error: { code: "bad_signature", message: "invalid signature" } });
      }
      const payload = ghl.parseWebhook(req.body);
      const result = await ingestCall(payload, { ghl });
      res.status(202).json(result); // 202: accepted for async processing
    }),
  );

  // ── Everything below requires auth ───────────────────────────────────────────
  const api = Router();
  api.use(requireAuth);

  // Manual ingest (useful for demos/tests).
  api.post(
    "/ingest",
    asyncHandler(async (req, res) => {
      res.status(202).json(await ingestCall(req.body, { ghl }));
    }),
  );

  // Trigger a backfill poll for a location.
  api.post(
    "/poll",
    asyncHandler(async (req, res) => {
      const locationId = req.body?.locationId;
      if (!locationId) throw new ValidationError("locationId required");
      res.json(await pollLocation(ghl, locationId, { since: req.body?.since }));
    }),
  );

  // Agents + dashboard summary.
  api.get(
    "/agents",
    asyncHandler(async (req, res) => {
      const locationId = q(req, "locationId");
      res.json(await repos().agents.listByLocation(locationId));
    }),
  );

  api.get(
    "/metrics/summary",
    asyncHandler(async (req, res) => {
      const locationId = q(req, "locationId");
      res.json(await repos().metrics.agentSummary(locationId));
    }),
  );

  // KPI definitions (observability parameters).
  api.get(
    "/agents/:agentId/kpis",
    asyncHandler(async (req, res) => {
      res.json(await repos().kpis.listByAgent(req.params.agentId));
    }),
  );

  api.put(
    "/agents/:agentId/kpis",
    asyncHandler(async (req, res) => {
      const list = z.array(KpiDefinitionSchema).parse(
        (req.body?.kpis || []).map((k) => ({ ...k, agentId: req.params.agentId })),
      );
      const saved = [];
      for (const def of list) saved.push(await repos().kpis.upsert(def));
      res.json(saved);
    }),
  );

  api.get(
    "/agents/:agentId/calls",
    asyncHandler(async (req, res) => {
      const calls = await repos().calls.listByLocation(q(req, "locationId"), { limit: 100 });
      res.json(calls.filter((c) => c.agentId === req.params.agentId));
    }),
  );

  api.get(
    "/calls/:callId",
    asyncHandler(async (req, res) => {
      const call = await repos().calls.get(req.params.callId);
      if (!call) throw new NotFoundError("call not found");
      const analysis = await repos().analyses.getByCall(req.params.callId);
      res.json({ call, analysis });
    }),
  );

  api.get(
    "/agents/:agentId/recommendations",
    asyncHandler(async (req, res) => {
      res.json(await repos().recommendations.listByAgent(req.params.agentId));
    }),
  );

  api.get(
    "/agents/:agentId/use-actions",
    asyncHandler(async (req, res) => {
      const resolved = req.query.resolved === undefined ? undefined : req.query.resolved === "true";
      res.json(await repos().useActions.listByAgent(req.params.agentId, { resolved }));
    }),
  );

  api.post(
    "/use-actions/:id/resolve",
    asyncHandler(async (req, res) => {
      const ua = await repos().useActions.resolve(req.params.id);
      if (!ua) throw new NotFoundError("use action not found");
      res.json(ua);
    }),
  );

  // Ops: dead letters + queue depth.
  api.get(
    "/dead-letters",
    asyncHandler(async (_req, res) => {
      res.json(await repos().deadLetters.list());
    }),
  );

  api.post(
    "/dead-letters/:id/replay",
    asyncHandler(async (req, res) => {
      const dls = await repos().deadLetters.list();
      const dl = dls.find((d) => d.id === req.params.id);
      if (!dl) throw new NotFoundError("dead letter not found");
      const queue = await getQueue();
      await queue.add(dl.jobName, dl.payload);
      await repos().deadLetters.markReplayed(dl.id);
      res.json({ replayed: true, id: dl.id });
    }),
  );

  router.use("/api", api);
  return router;
}

function q(req, key) {
  const v = req.query[key];
  if (!v) throw new ValidationError(`${key} query param required`);
  return String(v);
}
