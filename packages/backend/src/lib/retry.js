import { isRetryable } from "./errors.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Compute exponential backoff with full jitter.
 * delay = random(0, min(cap, base * 2^attempt))
 * Exported separately so it can be unit-tested deterministically.
 */
export function backoffDelay(attempt, { baseMs = 2000, capMs = 60000, rng = Math.random } = {}) {
  const exp = Math.min(capMs, baseMs * 2 ** attempt);
  return Math.floor(rng() * exp);
}

/**
 * Run `fn` with retries on transient failures.
 * - attempts: total tries (including the first)
 * - shouldRetry: predicate to override default classification
 * - onRetry: observability hook (attempt, error, delay)
 */
export async function withRetry(fn, {
  attempts = 5,
  baseMs = 2000,
  capMs = 60000,
  shouldRetry = isRetryable,
  onRetry = () => {},
  rng = Math.random,
} = {}) {
  let lastErr;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      const isLast = attempt === attempts - 1;
      if (isLast || !shouldRetry(err)) throw err;
      const delay = backoffDelay(attempt, { baseMs, capMs, rng });
      onRetry({ attempt: attempt + 1, error: err, delayMs: delay });
      await sleep(delay);
    }
  }
  throw lastErr;
}

/** Wrap a promise with a timeout that rejects as a retryable error. */
export async function withTimeout(promise, ms, label = "operation") {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => {
      const e = new Error(`${label} timed out after ${ms}ms`);
      e.code = "ETIMEDOUT";
      reject(e);
    }, ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(t);
  }
}
