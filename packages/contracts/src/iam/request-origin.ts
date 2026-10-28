/**
 * Where a request entered FluxIQ: the value of the `fluxiq:RequestOrigin`
 * condition key, and `runContext.origin` on a client gateway action command.
 *
 * - `panel`: the signed-in web panel;
 * - `extension-chat`: a connected client's chat;
 * - `schedule`: a scheduled task, with no person present;
 * - `api`: a Bearer or service-identity API call;
 * - `provisioning`: the provisioning API (private listener or in-process);
 * - `cli`: the operator command line.
 */
export const FLUXIQ_REQUEST_ORIGINS = Object.freeze(["panel", "extension-chat", "schedule", "api", "provisioning", "cli"] as const);

export type FluxIQRequestOrigin = (typeof FLUXIQ_REQUEST_ORIGINS)[number];

const ORIGINS: ReadonlySet<string> = new Set(FLUXIQ_REQUEST_ORIGINS);

/** True for one of `FLUXIQ_REQUEST_ORIGINS`. */
export function isFluxIQRequestOrigin(value: unknown): value is FluxIQRequestOrigin {
  return typeof value === "string" && ORIGINS.has(value);
}
