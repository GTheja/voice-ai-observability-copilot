import pino from "pino";
import { config } from "../config/index.js";

export const logger = pino({
  level: config.LOG_LEVEL,
  base: { service: "observability-copilot", role: process.env.ROLE || "api" },
  redact: {
    paths: ["req.headers.authorization", "*.apiKey", "*.OPENAI_API_KEY", "*.clientSecret"],
    censor: "[redacted]",
  },
});

// Child logger carrying a correlation id through the call lifecycle.
export function withCorrelation(correlationId) {
  return logger.child({ correlationId });
}

export default logger;
