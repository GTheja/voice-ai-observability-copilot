// Minimal, dependency-free .env loader. Reads the monorepo-root .env (resolved relative to
// THIS file, so it works regardless of the process CWD) and populates process.env for any
// key not already set. Handles inline `# comments` and surrounding quotes.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

export function loadEnv() {
  // src/lib -> src -> backend -> packages -> <root>
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../.env");
  if (!existsSync(root)) return;

  for (const raw of readFileSync(root, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1);

    const trimmed = val.trim();
    if (!/^["']/.test(trimmed)) {
      // strip inline comment (whitespace followed by #) for unquoted values
      const m = val.match(/\s#/);
      if (m) val = val.slice(0, m.index);
    }
    val = val.trim().replace(/^["']|["']$/g, "");

    if (process.env[key] === undefined) process.env[key] = val;
  }
}
