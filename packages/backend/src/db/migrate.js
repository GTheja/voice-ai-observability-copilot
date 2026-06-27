// Applies schema.sql. Idempotent; safe to run on every deploy.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { getPool, closePool } from "./pg.js";
import { logger } from "../lib/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function migrate() {
  const sql = await readFile(path.join(__dirname, "schema.sql"), "utf8");
  await getPool().query(sql);
  logger.info("migration applied");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrate()
    .then(() => closePool())
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error({ err }, "migration failed");
      process.exit(1);
    });
}
