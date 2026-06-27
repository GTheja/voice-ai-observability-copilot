// Centralized, validated config. Fails fast at boot if required env is missing
// for the selected adapters (e.g. real LLM without an API key).
import { z } from "zod";
import { loadEnv } from "../lib/loadEnv.js";

// Load the root .env BEFORE reading process.env below.
loadEnv();

const num = (def) => z.coerce.number().default(def);

const schema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: num(8080),
  LOG_LEVEL: z.string().default("info"),
  API_BEARER_TOKEN: z.string().default("dev-local-token"),

  GHL_ADAPTER: z.enum(["mock", "real"]).default("mock"),
  LLM_PROVIDER: z.enum(["mock", "openai", "anthropic"]).default("mock"),
  QUEUE_DRIVER: z.enum(["redis", "memory"]).default("redis"),
  DB_DRIVER: z.enum(["postgres", "memory"]).default("postgres"),

  DATABASE_URL: z.string().default("postgres://copilot:copilot@localhost:5432/copilot"),
  PG_POOL_MAX: num(10),

  REDIS_URL: z.string().default("redis://localhost:6379"),
  ANALYSIS_QUEUE: z.string().default("analysis"),
  WORKER_CONCURRENCY: num(4),
  WORKER_MAX_ATTEMPTS: num(5),
  WORKER_BACKOFF_MS: num(2000),
  LLM_RATE_LIMIT_PER_MIN: num(120),

  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-3-5-sonnet-latest"),
  LLM_TIMEOUT_MS: num(30000),

  GHL_BASE_URL: z.string().default("https://services.leadconnectorhq.com"),
  GHL_MARKETPLACE_URL: z.string().default("https://marketplace.gohighlevel.com"),
  GHL_CLIENT_ID: z.string().optional(),
  GHL_CLIENT_SECRET: z.string().optional(),
  GHL_REDIRECT_URI: z.string().optional(), // must equal the Redirect URL set in the GHL app
  GHL_SCOPES: z
    .string()
    .default("locations.readonly conversations.readonly conversations/message.readonly"),
  GHL_WEBHOOK_SECRET: z.string().optional(),
  GHL_API_VERSION: z.string().default("2021-07-28"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("Invalid configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;

// Cross-field guards: only enforce provider secrets when that provider is selected.
export function assertRuntimeConfig() {
  const errs = [];
  if (config.LLM_PROVIDER === "openai" && !config.OPENAI_API_KEY)
    errs.push("OPENAI_API_KEY required when LLM_PROVIDER=openai");
  if (config.LLM_PROVIDER === "anthropic" && !config.ANTHROPIC_API_KEY)
    errs.push("ANTHROPIC_API_KEY required when LLM_PROVIDER=anthropic");
  if (config.GHL_ADAPTER === "real" && (!config.GHL_CLIENT_ID || !config.GHL_CLIENT_SECRET))
    errs.push("GHL_CLIENT_ID/SECRET required when GHL_ADAPTER=real");
  if (errs.length) {
    // eslint-disable-next-line no-console
    console.error("Runtime config errors:\n - " + errs.join("\n - "));
    process.exit(1);
  }
}

export default config;
