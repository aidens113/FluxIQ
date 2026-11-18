import { createHash } from "node:crypto";

export const INSTANCE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;

/**
 * The instance identity key sessions and discovery share. An explicit FLUXIQ_INSTANCE_ID always
 * wins (callers validate its form). Only the local profile may go without one: its identity is derived
 * from its configured public origin, so it is stable across restarts and never read from a request.
 * Every other profile must name its instance. Returns undefined when none can be determined.
 */
export function resolveInstanceId(
  env: Readonly<Record<string, string | undefined>>,
  settings: { profile: string; publicOrigin: string }
): string | undefined {
  const explicit = env.FLUXIQ_INSTANCE_ID?.trim();
  if (explicit) return explicit;
  if (settings.profile !== "local") return undefined;
  return `local-${createHash("sha256").update(new URL(settings.publicOrigin).origin).digest("hex").slice(0, 16)}`;
}
