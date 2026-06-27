// Backfill poller — pulls historical/new calls from the GHL adapter and ingests them.
// Idempotency in ingestCall() makes re-polling safe (already-seen calls are ignored).
import { ingestCall } from "./service.js";
import { logger } from "../lib/logger.js";

export async function pollLocation(ghl, locationId, { since } = {}) {
  let cursor = null;
  let ingested = 0;
  let ignored = 0;
  do {
    const { calls, cursor: next } = await ghl.listCalls(locationId, { since, cursor });
    for (const call of calls) {
      const res = await ingestCall(call, { ghl });
      if (res.duplicate) ignored++;
      else ingested++;
    }
    cursor = next;
  } while (cursor);
  logger.info({ locationId, ingested, ignored }, "poll complete");
  return { ingested, ignored };
}
