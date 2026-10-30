/**
 * What the setup submit answers: the route turns it into an HTTP response. A
 * refusal carries a code (and, for a bad form, the field names, or for a
 * throttle, the wait), never anything the person typed. `session` is set only
 * when the owner is now signed in.
 */
export type SetupResponse = {
  status: number;
  body: { ok: true; redirectTo: string } | { ok: false; code: string; fields?: string[]; retryAfterMs?: number };
  session?: { id: string; ttlMs: number };
  headers?: Record<string, string>;
};
