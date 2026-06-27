// Analysis worker. Registers the processor + dead-letter handler on the queue.
// Runs as its own process (Redis driver) or in-process with the API (memory driver).
import { config, assertRuntimeConfig } from "./config/index.js";
import { logger } from "./lib/logger.js";
import { getQueue } from "./queue/index.js";
import { initRepositories } from "./db/index.js";
import { createLLMProvider } from "./adapters/llm/provider.js";
import { makeAnalysisProcessor, makeDeadLetterHandler } from "./analysis/processor.js";

export async function startWorker() {
  await initRepositories();
  const queue = await getQueue();
  const llm = createLLMProvider();
  const processor = makeAnalysisProcessor({ llm });
  const deadLetter = makeDeadLetterHandler();

  queue.setDeadLetterHandler?.(deadLetter);
  queue.process(processor);

  logger.info({ driver: config.QUEUE_DRIVER, llm: llm.name }, "worker started");
  return queue;
}

// CLI entrypoint (separate worker process).
if (import.meta.url === `file://${process.argv[1]}`) {
  assertRuntimeConfig();
  startWorker().catch((err) => {
    logger.error({ err }, "worker boot failed");
    process.exit(1);
  });

  const shutdown = async () => {
    logger.info("worker shutting down");
    const q = await getQueue();
    await q.close?.();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
