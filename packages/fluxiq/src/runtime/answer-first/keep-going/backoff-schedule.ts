// How long a silent model service is waited for. Waiting costs nothing and never
// runs out; only the delay between asks grows, so a long outage is polled gently.
// Decided here: 5 s, doubling, capped at 60 s (5, 10, 20, 40, 60, 60, ...).

export const AUTOMATION_STUDIO_ANSWER_FIRST_BACKOFF = Object.freeze({ baseMs: 5_000, capMs: 60_000 });
