import type { FluxIQProfile } from "@fluxiq/contracts/platform";

/**
 * Whether Core's own sign-up page (`/signup`) is open (`FLUXIQ_SIGNUP`):
 * `off` (the default, also when empty or unset) or `open`; any other value
 * throws, naming the variable. It is honoured only on `service`, the
 * multi-tenant profile, where each sign-up gets its own personal workspace;
 * on `local` and `self-hosted` the page stays closed whatever the value, since
 * there a sign-up would join the one shared workspace.
 */
export function resolveSignupMode(profile: FluxIQProfile, env: Readonly<Record<string, string | undefined>>): "off" | "open" {
  const raw = env.FLUXIQ_SIGNUP?.trim() ?? "";
  if (raw !== "" && raw !== "off" && raw !== "open") throw new Error("FLUXIQ_SIGNUP must be off or open.");
  return raw === "open" && profile === "service" ? "open" : "off";
}
