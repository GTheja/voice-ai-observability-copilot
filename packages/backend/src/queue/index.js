import { config } from "../config/index.js";
import { MemoryQueue } from "./memoryQueue.js";

let queue;

// Lazily create the queue. BullMQ is imported dynamically so `dev:mock`/tests never need
// Redis or the bullmq/ioredis native deps installed.
export async function getQueue() {
  if (queue) return queue;
  if (config.QUEUE_DRIVER === "memory") {
    queue = new MemoryQueue({
      name: config.ANALYSIS_QUEUE,
      maxAttempts: config.WORKER_MAX_ATTEMPTS,
    });
  } else {
    const { BullQueue } = await import("./bullQueue.js");
    queue = new BullQueue({ name: config.ANALYSIS_QUEUE });
  }
  return queue;
}

export function setQueue(q) {
  queue = q;
}
