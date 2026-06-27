import express from "express";
import pinoHttp from "pino-http";
import { config, assertRuntimeConfig } from "./config/index.js";
import { logger } from "./lib/logger.js";
import { buildRouter } from "./api/routes.js";
import { buildOAuthRouter } from "./api/oauth.js";
import { errorHandler } from "./api/middleware.js";
import { createGHLAdapter } from "./adapters/ghl/adapter.js";
import { getQueue } from "./queue/index.js";
import { initRepositories } from "./db/index.js";
import { startWorker } from "./worker.js";

export async function createApp() {
  const app = express();
  app.use(pinoHttp({ logger }));
  // Capture raw body for webhook HMAC verification.
  app.use(
    express.json({
      limit: "2mb",
      verify: (req, _res, buf) => {
        req.rawBody = buf.toString("utf8");
      },
    }),
  );

  const ghl = createGHLAdapter();

  app.get("/health", async (_req, res) => {
    let queue = null;
    try {
      const q = await getQueue();
      queue = (await q.getDepth?.()) || { driver: config.QUEUE_DRIVER };
    } catch {
      queue = { error: "unavailable" };
    }
    res.json({ status: "ok", ghl: ghl.name, queue });
  });

  app.use(buildOAuthRouter()); // public: /oauth/install, /oauth/callback
  app.use(buildRouter({ ghl }));
  app.use(errorHandler);
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  assertRuntimeConfig();
  await initRepositories();

  // With the in-memory queue, the producer and consumer must share one process.
  if (config.QUEUE_DRIVER === "memory") {
    await startWorker();
  }

  if (config.DB_DRIVER === "memory") {
    const { seed } = await import("./db/seed.js");
    await seed().catch((err) => logger.error({ err }, "failed to seed in-memory db"));
  }

  const app = await createApp();
  const server = app.listen(config.PORT, () => logger.info(`API listening on :${config.PORT}`));

  const shutdown = async () => {
    logger.info("API shutting down");
    server.close();
    const q = await getQueue();
    await q.close?.();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
