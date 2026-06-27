import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Force the zero-dependency drivers so the suite runs with no Postgres/Redis.
    env: {
      NODE_ENV: "test",
      DB_DRIVER: "memory",
      QUEUE_DRIVER: "memory",
      LLM_PROVIDER: "mock",
      GHL_ADAPTER: "mock",
      LOG_LEVEL: "silent",
      WORKER_MAX_ATTEMPTS: "3",
      GHL_CLIENT_ID: "test-client",
      GHL_CLIENT_SECRET: "test-secret",
      GHL_REDIRECT_URI: "https://example.test/oauth/callback",
      GHL_SCOPES: "locations.readonly voice-ai-dashboard.readonly voice-ai-agents.readonly voice-ai-agent-goals.readonly",
    },
    include: ["test/**/*.test.js"],
    testTimeout: 15000,
  },
});
