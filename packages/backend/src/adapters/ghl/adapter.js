// GHL port (interface) + factory.
//
//   interface GHLAdapter {
//     listAgents(locationId): Promise<Agent[]>
//     listCalls(locationId, { since, cursor }): Promise<{ calls: CallPayload[], cursor }>
//     getCall(locationId, callId): Promise<CallPayload>
//     verifyWebhook(rawBody, signature): boolean        // HMAC auth
//     parseWebhook(body): CallPayload                    // normalize to our schema
//   }
import { config } from "../../config/index.js";
import { MockGHLAdapter } from "./mock.js";
import { RealGHLAdapter } from "./real.js";

export function createGHLAdapter(name = config.GHL_ADAPTER) {
  return name === "real" ? new RealGHLAdapter() : new MockGHLAdapter();
}
