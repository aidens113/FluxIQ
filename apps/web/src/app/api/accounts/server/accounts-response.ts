/**
 * What an `/api/accounts` handler answers; the route turns it into HTTP. A
 * refusal carries a `code`, a sentence for the person, and `requiresRecheck`
 * when only re-proving their credentials is missing; `headers` carries a
 * 429's `retry-after`. Never a password, token, session id or provisioning
 * message.
 */
export type AccountsResponse = {
  status: number;
  body: { ok: true; payload?: unknown } | { ok: false; code: string; error: string; requiresRecheck?: true };
  /** Response headers beyond the defaults: only `retry-after` on a 429. */
  headers?: Readonly<Record<string, string>>;
};
