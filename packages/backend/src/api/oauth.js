// OAuth install + callback routes (public — no bearer; GHL drives these in the browser).
//   GET /oauth/install   → redirect the user to GHL's consent screen
//   GET /oauth/callback  → exchange ?code= for tokens and persist the grant
import { Router } from "express";
import { asyncHandler } from "./middleware.js";
import { authorizeUrl, exchangeCode } from "../adapters/ghl/oauth.js";
import { saveGrant } from "../adapters/ghl/tokenStore.js";
import { config } from "../config/index.js";
import { logger } from "../lib/logger.js";

export function buildOAuthRouter() {
  const router = Router();

  // Kick off the install (you can also use GHL's own install button).
  router.get(
    "/oauth/install",
    asyncHandler(async (req, res) => {
      if (!config.GHL_CLIENT_ID || !config.GHL_REDIRECT_URI) {
        return res.status(500).send("GHL_CLIENT_ID / GHL_REDIRECT_URI not configured");
      }
      res.redirect(authorizeUrl(String(req.query.state || "")));
    }),
  );

  // GHL redirects here after the user grants access.
  router.get(
    "/oauth/callback",
    asyncHandler(async (req, res) => {
      const { code, error, error_description: desc } = req.query;
      if (error) return res.status(400).send(`Authorization failed: ${error} ${desc || ""}`);
      if (!code) return res.status(400).send("Missing ?code");

      const grant = await exchangeCode(String(code));
      if (!grant.locationId) {
        logger.error({ grant: { ...grant, accessToken: "[redacted]", refreshToken: "[redacted]" } }, "no locationId in token response");
        return res.status(502).send("Token exchange succeeded but no locationId was returned.");
      }
      await saveGrant(grant);
      logger.info({ locationId: grant.locationId, scope: grant.scope }, "GHL app installed");

      // Friendly landing page (close tab or deep-link into the dashboard).
      res.set("Content-Type", "text/html").send(
        `<!doctype html><html><body style="font-family:system-ui;padding:40px">
           <h2>✅ Connected</h2>
           <p>Voice AI Observability Copilot is now installed for location
             <code>${escapeHtml(grant.locationId)}</code>.</p>
           <p>You can close this tab and open the Copilot from your HighLevel menu.</p>
         </body></html>`,
      );
    }),
  );

  return router;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
