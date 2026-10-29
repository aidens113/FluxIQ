import { DEFAULT_SESSION_TTL_MS } from "fluxiq";

/** The session cookie's options: the same as the sign-in route sets. */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(DEFAULT_SESSION_TTL_MS / 1000),
  };
}
