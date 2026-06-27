// Typed errors so the retry layer can distinguish transient from fatal failures.

export class AppError extends Error {
  constructor(message, { status = 500, code = "internal_error", retryable = false, cause } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    if (cause) this.cause = cause;
  }
}

export class ValidationError extends AppError {
  constructor(message, details) {
    super(message, { status: 422, code: "validation_error", retryable: false });
    this.details = details;
  }
}

export class NotFoundError extends AppError {
  constructor(message = "not found") {
    super(message, { status: 404, code: "not_found", retryable: false });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "unauthorized") {
    super(message, { status: 401, code: "unauthorized", retryable: false });
  }
}

// Transient: network blips, rate limits, 5xx from upstreams.
export class RetryableError extends AppError {
  constructor(message, { code = "retryable", cause } = {}) {
    super(message, { status: 503, code, retryable: true, cause });
  }
}

// Decide whether an arbitrary thrown error should be retried.
export function isRetryable(err) {
  if (err instanceof AppError) return err.retryable;
  // Heuristics for raw upstream errors (HTTP clients, sockets).
  const status = err?.status ?? err?.response?.status;
  if (status && (status === 429 || status >= 500)) return true;
  const code = err?.code;
  return ["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "EAI_AGAIN", "EPIPE"].includes(code);
}
