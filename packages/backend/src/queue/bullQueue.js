// BullMQ-backed queue (Redis). Provides retries, exponential backoff, concurrency, and a
// rate limiter for outbound LLM calls. Failed-after-retries jobs are mirrored to the DB DLQ.
import { Queue, Worker, QueueEvents } from "bullmq";
import IORedis from "ioredis";
import { config } from "../config/index.js";
import { logger } from "../lib/logger.js";

function connection() {
  return new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null });
}

export class BullQueue {
  constructor({ name }) {
    this.name = name;
    this.conn = connection();
    this.queue = new Queue(name, { connection: this.conn });
    this.worker = null;
    this.events = null;
    this.onDeadLetter = null;
  }

  setDeadLetterHandler(fn) {
    this.onDeadLetter = fn;
  }

  async add(name, data) {
    await this.queue.add(name, data, {
      attempts: config.WORKER_MAX_ATTEMPTS,
      backoff: { type: "exponential", delay: config.WORKER_BACKOFF_MS },
      removeOnComplete: { age: 3600, count: 1000 },
      removeOnFail: false, // keep failed jobs for inspection
    });
  }

  // Start consuming. Only the worker process calls this.
  process(handler) {
    this.worker = new Worker(
      this.name,
      async (job) => handler({ name: job.name, data: job.data, attemptsMade: job.attemptsMade }),
      {
        connection: connection(),
        concurrency: config.WORKER_CONCURRENCY,
        limiter: { max: config.LLM_RATE_LIMIT_PER_MIN, duration: 60_000 },
      },
    );

    this.worker.on("failed", async (job, err) => {
      const exhausted = job && job.attemptsMade >= (job.opts.attempts || 1);
      logger.error({ jobId: job?.id, attempts: job?.attemptsMade, err: err?.message, exhausted }, "job failed");
      if (exhausted && this.onDeadLetter) {
        await this.onDeadLetter({ name: job.name, data: job.data, err, attempts: job.attemptsMade });
      }
    });

    this.events = new QueueEvents(this.name, { connection: connection() });
  }

  async getDepth() {
    const counts = await this.queue.getJobCounts("waiting", "active", "delayed", "failed");
    return counts;
  }

  async close() {
    await this.worker?.close();
    await this.events?.close();
    await this.queue.close();
    await this.conn.quit();
  }
}
