/**
 * How long provisioning's time-bound records live: a welcome link 24 hours, a
 * reset link 1 hour, a scheduled deletion 7 days.
 */
export const PROVISIONING_LIFETIMES = Object.freeze({
  welcomeLinkMs: 24 * 60 * 60 * 1000,
  resetLinkMs: 60 * 60 * 1000,
  scheduledDeletionMs: 7 * 24 * 60 * 60 * 1000
});
