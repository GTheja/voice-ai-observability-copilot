// GHL OAuth 2.0 (Authorization Code grant) helpers.
//   • authorizeUrl()  — where to send the user to install/grant
//   • exchangeCode()  — swap the ?code= for access/refresh tokens
//   • refresh()       — get a fresh access token from a refresh token
//
// Token endpoint: POST {GHL_BASE_URL}/oauth/token  (application/x-www-form-urlencoded)
// Docs: https://marketplace.gohighlevel.com/docs/Authorization/OAuth2.0/
import { config } from "../../config/index.js";
import { withRetry, withTimeout } from "../../lib/retry.js";
import { RetryableError, AppError } from "../../lib/errors.js";

// Build the install/consent URL (used by GET /oauth/install).
export function authorizeUrl(state = "") {
  const u = new URL(`${config.GHL_MARKETPLACE_URL}/oauth/chooselocation`);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", config.GHL_CLIENT_ID || "");
  u.searchParams.set("redirect_uri", config.GHL_REDIRECT_URI || "");
  u.searchParams.set("scope", config.GHL_SCOPES);
  if (state) u.searchParams.set("state", state);
  return u.toString();
}

async function postToken(params) {
  const body = new URLSearchParams({
    client_id: config.GHL_CLIENT_ID,
    client_secret: config.GHL_CLIENT_SECRET,
    ...params,
  });

  return withRetry(
    async () => {
      const res = await withTimeout(
        fetch(`${config.GHL_BASE_URL}/oauth/token`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
          body,
        }),
        config.LLM_TIMEOUT_MS,
        "ghl.oauth.token",
      );
      if (res.status === 429 || res.status >= 500)
        throw new RetryableError(`GHL token endpoint transient ${res.status}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new AppError(`GHL token exchange failed ${res.status}: ${JSON.stringify(data)}`, {
          status: res.status,
        });
      }
      return data;
    },
    { attempts: 3, baseMs: 300, capMs: 3000 },
  );
}

// Normalize the GHL token response into our oauth_tokens row shape.
function normalize(data) {
  const expiresInMs = (Number(data.expires_in) || 3600) * 1000;
  return {
    locationId: data.locationId || data.location_id,
    companyId: data.companyId || data.company_id || null,
    userType: data.userType || data.user_type || null,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    scope: data.scope || null,
    expiresAt: new Date(Date.now() + expiresInMs),
  };
}

export async function exchangeCode(code) {
  const data = await postToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.GHL_REDIRECT_URI,
    user_type: "Location",
  });
  return normalize(data);
}

export async function refresh(refreshToken) {
  const data = await postToken({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    user_type: "Location",
  });
  return normalize(data);
}
