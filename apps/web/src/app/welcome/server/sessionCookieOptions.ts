import { DEFAULT_SESSION_TTL_MS } from "fluxiq";
import { sessionCookieOptions as hostedSessionCookieOptions } from "../../../lib/session-cookie";

/** The session cookie's options: the same as the sign-in route sets. */
export function sessionCookieOptions() {
  return hostedSessionCookieOptions(Math.floor(DEFAULT_SESSION_TTL_MS / 1000));
}
