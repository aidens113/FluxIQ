/**
 * The deployment profiles (`FLUXIQ_PROFILE`): one image, three profiles.
 *
 * - `local`: one person on their own machine, served on loopback;
 * - `self-hosted`: an operator's own server, single or multi-user;
 * - `service`: the public hosted service (getfluxiq.com), multi-tenant.
 *
 * A profile is public when it is `service` or when it is bound beyond
 * loopback; the gateway's Origin rule treats both alike.
 */
export const FLUXIQ_PROFILES = Object.freeze(["local", "self-hosted", "service"] as const);

export type FluxIQProfile = (typeof FLUXIQ_PROFILES)[number];

const PROFILES: ReadonlySet<string> = new Set(FLUXIQ_PROFILES);

/** True for one of `FLUXIQ_PROFILES`. */
export function isFluxIQProfile(value: unknown): value is FluxIQProfile {
  return typeof value === "string" && PROFILES.has(value);
}
