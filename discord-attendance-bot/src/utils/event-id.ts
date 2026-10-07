import { randomUUID } from "crypto";

/**
 * Generate a unique event id for idempotency.
 * Format: `<prefix>_<uuid>` e.g. `evt_9f3a...`.
 */
export function newEventId(prefix = "evt"): string {
  return `${prefix}_${randomUUID()}`;
}
