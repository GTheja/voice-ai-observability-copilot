import pg from "pg";
import { config } from "../config/index.js";
import { logger } from "../lib/logger.js";
import { withRetry } from "../lib/retry.js";

const { Pool } = pg;

let pool;
export function getPool() {
  if (!pool) {
    pool = new Pool({ connectionString: config.DATABASE_URL, max: config.PG_POOL_MAX });
    pool.on("error", (err) => logger.error({ err }, "pg pool error"));
  }
  return pool;
}

// Query with bounded retry on transient acquisition/connection errors.
export async function query(text, params) {
  return withRetry(() => getPool().query(text, params), {
    attempts: 3,
    baseMs: 200,
    capMs: 2000,
  });
}

// Run a function inside a transaction; rolls back on throw.
export async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool() {
  if (pool) await pool.end();
  pool = undefined;
}
