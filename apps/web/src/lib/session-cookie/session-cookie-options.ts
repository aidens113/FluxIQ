import { resolveFluxIQDeploymentSettings } from "fluxiq/platform/profile";

const secure = resolveFluxIQDeploymentSettings(process.env).session.secure;

/**
 * The session cookie's attributes, for setting and for clearing (a `__Host-`
 * cookie is only cleared by a response that carries Secure and Path=/ too).
 */
export function sessionCookieOptions(maxAgeSeconds: number) {
  return { httpOnly: true, sameSite: "lax" as const, secure, path: "/", maxAge: maxAgeSeconds };
}
