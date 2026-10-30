/** The setup submit's answer as the page reads it. */
export type SetupAnswer = { ok: true; redirectTo: string } | { ok: false; code: string; fields: string[]; retryAfterMs?: number };
