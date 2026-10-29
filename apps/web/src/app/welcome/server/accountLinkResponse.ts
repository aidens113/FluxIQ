/** What an account-link handler answers: the route turns it into an HTTP response. `session` is set only when the person is now signed in. */
export type AccountLinkResponse = {
  status: number;
  body: { ok: true; continueUrl?: string } | { ok: false; code: string };
  session?: { id: string; ttlMs: number };
};
