// Managed browser hosts: the launcher interface `fluxiq dev --browsers N` loads
// an implementation of, without Core depending on one.
export type { FluxIQHostLaunchRequest } from "./host-launch-request.ts";
export type { FluxIQHostLauncher } from "./host-launcher.ts";
export type { FluxIQLaunchedHost } from "./launched-host.ts";
export { loadManagedHostLauncher } from "./load-launcher.ts";
export { startManagedHosts } from "./start-managed-hosts.ts";
export { managedClientAuthority } from "./client-authority.ts";
