import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { authorizeUrl, exchangeCode, refresh } from "../../src/adapters/ghl/oauth.js";
import { getValidAccessToken, saveGrant } from "../../src/adapters/ghl/tokenStore.js";
import { createMemoryRepositories, setRepositories } from "../../src/db/index.js";

function mockTokenResponse(body, ok = true, status = 200) {
  return vi.fn(async () => ({
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }));
}

afterEach(() => vi.unstubAllGlobals());

describe("authorizeUrl", () => {
  it("builds a consent URL with the configured client + redirect + scopes", () => {
    const url = new URL(authorizeUrl("xyz"));
    expect(url.pathname).toContain("/oauth/chooselocation");
    expect(url.searchParams.get("client_id")).toBe("test-client");
    expect(url.searchParams.get("redirect_uri")).toBe("https://example.test/oauth/callback");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("xyz");
    expect(url.searchParams.get("scope")).toContain("voice-ai-dashboard.readonly");
  });
});

describe("exchangeCode", () => {
  it("swaps a code for a normalized grant", async () => {
    vi.stubGlobal(
      "fetch",
      mockTokenResponse({
        access_token: "acc_1",
        refresh_token: "ref_1",
        expires_in: 3600,
        scope: "locations.readonly",
        locationId: "loc_abc",
        companyId: "co_1",
        userType: "Location",
      }),
    );
    const grant = await exchangeCode("the-code");
    expect(grant).toMatchObject({
      locationId: "loc_abc",
      companyId: "co_1",
      accessToken: "acc_1",
      refreshToken: "ref_1",
      scope: "locations.readonly",
    });
    expect(grant.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("throws on a non-2xx token response", async () => {
    vi.stubGlobal("fetch", mockTokenResponse({ error: "invalid_grant" }, false, 400));
    await expect(exchangeCode("bad")).rejects.toThrow(/token exchange failed/i);
  });
});

describe("token store refresh", () => {
  beforeEach(() => setRepositories(createMemoryRepositories()));

  it("returns the stored token when still valid (no network call)", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    await saveGrant({
      locationId: "loc_1",
      accessToken: "valid_token",
      refreshToken: "ref",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const token = await getValidAccessToken("loc_1");
    expect(token).toBe("valid_token");
    expect(spy).not.toHaveBeenCalled();
  });

  it("refreshes and persists when the token is expired", async () => {
    await saveGrant({
      locationId: "loc_1",
      accessToken: "old_token",
      refreshToken: "ref_old",
      expiresAt: new Date(Date.now() - 1000), // already expired
    });
    vi.stubGlobal(
      "fetch",
      mockTokenResponse({
        access_token: "new_token",
        refresh_token: "ref_new",
        expires_in: 3600,
        locationId: "loc_1",
      }),
    );
    const token = await getValidAccessToken("loc_1");
    expect(token).toBe("new_token");
  });

  it("rejects when the app is not installed for the location", async () => {
    await expect(getValidAccessToken("never_installed")).rejects.toThrow(/not installed/i);
  });
});
