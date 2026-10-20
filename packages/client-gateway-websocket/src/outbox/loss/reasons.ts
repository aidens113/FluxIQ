/**
 * Why queued entries were lost before they could be sent:
 *
 * - `count_limit`: the outbox held its limit of entries and dropped the oldest.
 * - `byte_budget`: the entries would have passed the outbox's byte budget, so
 *   the oldest were dropped, or one entry alone was over it and never stored.
 * - `write_failed`: the store refused a write, so the oldest entries were
 *   dropped until a write fitted, or the entry being queued could not be kept.
 */
export const CLIENT_GATEWAY_OUTBOX_LOSS_REASONS = ["count_limit", "byte_budget", "write_failed"] as const;
