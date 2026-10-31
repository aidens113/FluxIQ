import type { resolveFluxIQProfile } from "fluxiq/platform/profile";

/**
 * How many workspaces one web server holds: `single` keeps today's one
 * instance (local and self-hosted); `multi` keeps one per tenant workspace
 * (the hosted `service`), each under layout v3.
 */
export type WorkspaceTenancy = "single" | "multi";

/** The tenancy a deployment profile runs: `service` is multi-tenant; `local` and `self-hosted` keep one workspace. */
export function workspaceTenancyOfProfile(profile: ReturnType<typeof resolveFluxIQProfile>): WorkspaceTenancy {
  return profile === "service" ? "multi" : "single";
}
