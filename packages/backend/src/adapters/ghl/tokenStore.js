// Persists install grants and hands out valid access tokens, refreshing transparently
// when they are within the expiry buffer.
import { getRepositories } from "../../db/index.js";
import { refresh } from "./oauth.js";
import { AppError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";

const EXPIRY_BUFFER_MS = 5 * 60 * 1000; // refresh 5 min before expiry

export async function saveGrant(grant) {
  return getRepositories().tokens.upsert(grant);
}

export async function getValidAccessToken(locationId) {
  const repos = getRepositories();
  const row = await repos.tokens.get(locationId);
  if (!row) throw new AppError(`No GHL token for location ${locationId} — app not installed`, { status: 401, code: "not_installed" });

  const expiresAt = new Date(row.expiresAt || row.expires_at).getTime();
  if (Date.now() < expiresAt - EXPIRY_BUFFER_MS) {
    return row.accessToken || row.access_token;
  }

  // Refresh and persist.
  logger.info({ locationId }, "refreshing GHL access token");
  const fresh = await refresh(row.refreshToken || row.refresh_token);
  // GHL omits locationId on refresh responses — carry it over.
  fresh.locationId = fresh.locationId || locationId;
  await repos.tokens.upsert(fresh);
  return fresh.accessToken;
}
