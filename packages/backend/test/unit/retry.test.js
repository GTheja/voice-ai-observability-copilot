import { describe, it, expect, vi } from "vitest";
import { backoffDelay, withRetry, withTimeout } from "../../src/lib/retry.js";
import { RetryableError, AppError } from "../../src/lib/errors.js";

describe("backoffDelay", () => {
  it("grows exponentially and respects the cap", () => {
    const rng = () => 1; // max jitter
    expect(backoffDelay(0, { baseMs: 100, rng })).toBe(100);
    expect(backoffDelay(1, { baseMs: 100, rng })).toBe(200);
    expect(backoffDelay(2, { baseMs: 100, rng })).toBe(400);
    expect(backoffDelay(10, { baseMs: 100, capMs: 1000, rng })).toBe(1000);
  });

  it("applies jitter between 0 and the exponential bound", () => {
    const d = backoffDelay(3, { baseMs: 100, rng: () => 0.5 });
    expect(d).toBe(400); // 0.5 * (100 * 2^3) = 0.5 * 800
  });
});

describe("withRetry", () => {
  it("retries retryable errors then succeeds", async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      if (calls < 3) throw new RetryableError("boom");
      return "ok";
    });
    const result = await withRetry(fn, { attempts: 5, baseMs: 1, capMs: 1 });
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("does not retry fatal errors", async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      throw new AppError("fatal", { retryable: false });
    };
    await expect(withRetry(fn, { attempts: 5, baseMs: 1 })).rejects.toThrow("fatal");
    expect(calls).toBe(1);
  });

  it("gives up after max attempts and rethrows", async () => {
    const fn = async () => {
      throw new RetryableError("always");
    };
    await expect(withRetry(fn, { attempts: 3, baseMs: 1, capMs: 1 })).rejects.toThrow("always");
  });
});

describe("withTimeout", () => {
  it("rejects with a retryable timeout error", async () => {
    const never = new Promise(() => {});
    await expect(withTimeout(never, 10, "t")).rejects.toMatchObject({ code: "ETIMEDOUT" });
  });

  it("resolves when the promise wins", async () => {
    await expect(withTimeout(Promise.resolve(42), 100)).resolves.toBe(42);
  });
});
