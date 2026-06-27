// In-process queue with the same surface as the BullMQ wrapper. Implements bounded retries
// with exponential backoff and a dead-letter callback. Used for `dev:mock` and tests.
import { EventEmitter } from "node:events";
import { backoffDelay } from "../lib/retry.js";
import { isRetryable } from "../lib/errors.js";

export class MemoryQueue extends EventEmitter {
  constructor({ name, maxAttempts = 5, baseMs = 200 }) {
    super();
    this.name = name;
    this.maxAttempts = maxAttempts;
    this.baseMs = baseMs;
    this.handler = null;
    this.onDeadLetter = null;
    this._pending = 0;
  }

  process(handler) {
    this.handler = handler;
  }

  setDeadLetterHandler(fn) {
    this.onDeadLetter = fn;
  }

  async add(name, data) {
    if (!this.handler) throw new Error("MemoryQueue: no handler registered");
    this._pending++;
    // Run async so add() returns immediately, mimicking a real queue.
    queueMicrotask(() => this._run(name, data, 0));
  }

  async _run(name, data, attemptsMade) {
    try {
      await this.handler({ name, data, attemptsMade });
      this._pending--;
      this.emit("completed", { name, data });
    } catch (err) {
      const canRetry = attemptsMade + 1 < this.maxAttempts && isRetryable(err);
      if (canRetry) {
        const delay = backoffDelay(attemptsMade, { baseMs: this.baseMs, capMs: 5000 });
        this.emit("retry", { name, attempt: attemptsMade + 1, err });
        setTimeout(() => this._run(name, data, attemptsMade + 1), delay);
      } else {
        this._pending--;
        this.emit("failed", { name, data, err, attempts: attemptsMade + 1 });
        if (this.onDeadLetter) await this.onDeadLetter({ name, data, err, attempts: attemptsMade + 1 });
      }
    }
  }

  // Test helper: resolve when the queue has drained.
  async drain(timeoutMs = 5000) {
    const start = Date.now();
    while (this._pending > 0) {
      if (Date.now() - start > timeoutMs) throw new Error("drain timeout");
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  async close() {}
}
