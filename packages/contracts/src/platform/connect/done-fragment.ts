import { connectFieldSchemas } from "./fields.ts";

/**
 * Why the authorize page sent the client back without a code:
 * `access_denied` (the person declined consent) or `server_error`.
 */
export const CONNECT_DONE_ERRORS = Object.freeze(["access_denied", "server_error"] as const);

export type ConnectDoneError = (typeof CONNECT_DONE_ERRORS)[number];

/** What `/connect/done#...` carries back to the client. */
export type ConnectDoneFragment = { kind: "code"; code: string; state: string } | { kind: "error"; error: ConnectDoneError; state: string };

const DONE_ERRORS: ReadonlySet<string> = new Set(CONNECT_DONE_ERRORS);

/**
 * Reads the fragment of a `/connect/done` URL (`#code=..&state=..` or
 * `#error=..&state=..`, the leading `#` optional), or returns null for any
 * other shape: a repeated or unknown parameter, both a code and an error, or
 * an ill-formed value. The client still checks `state` is its own and that
 * the URL came from its own tab at the exact origin.
 */
export function parseConnectDoneFragment(fragment: string): ConnectDoneFragment | null {
  const params = new URLSearchParams(fragment.startsWith("#") ? fragment.slice(1) : fragment);
  const keys = [...params.keys()];
  if (new Set(keys).size !== keys.length) return null;
  const state = params.get("state");
  if (state === null || !connectFieldSchemas.state.safeParse(state).success) return null;
  const code = params.get("code");
  const error = params.get("error");
  if (keys.length !== 2) return null;
  if (code !== null && connectFieldSchemas.code.safeParse(code).success) return { kind: "code", code, state };
  if (error !== null && DONE_ERRORS.has(error)) return { kind: "error", error: error as ConnectDoneError, state };
  return null;
}
