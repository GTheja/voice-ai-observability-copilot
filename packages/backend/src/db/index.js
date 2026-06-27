import { config } from "../config/index.js";
import { createMemoryRepositories } from "./memory.js";

let repos;

// Singleton factory. The Postgres driver (and its `pg` dependency) is imported lazily so
// `memory` mode — used by tests and `dev:mock` — needs no native/DB dependencies at all.
export async function initRepositories() {
  if (repos) return repos;
  if (config.DB_DRIVER === "memory") {
    repos = createMemoryRepositories();
  } else {
    const { createPostgresRepositories } = await import("./postgres.js");
    repos = createPostgresRepositories();
  }
  return repos;
}

// Synchronous accessor for hot paths. Falls back to memory if init was skipped (tests).
export function getRepositories() {
  if (!repos) repos = createMemoryRepositories();
  return repos;
}

// Test/DI helper to inject an explicit implementation.
export function setRepositories(r) {
  repos = r;
}

export { createMemoryRepositories };
