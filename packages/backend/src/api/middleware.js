import { config } from "../config/index.js";
import { AppError, UnauthorizedError } from "../lib/errors.js";

// Wrap async route handlers so thrown errors hit the error middleware.
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Simple bearer auth for /api routes (the GHL embed injects the token).
export function requireAuth(req, _res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token || token !== config.API_BEARER_TOKEN) {
    return next(new UnauthorizedError());
  }
  next();
}

// Centralized error handler — uniform JSON error shape, correct status codes.
export function errorHandler(err, req, res, _next) {
  const status = err instanceof AppError ? err.status : 500;
  const body = {
    error: {
      code: err.code || "internal_error",
      message: status === 500 ? "internal server error" : err.message,
      ...(err.details ? { details: err.details } : {}),
    },
  };
  if (status >= 500) req.log?.error?.({ err }, "unhandled error");
  res.status(status).json(body);
}
