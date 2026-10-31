import type { FluxIQ } from "fluxiq";
import type { HeldKeys } from "fluxiq/secret-keys";
import type { WorkspaceTenancy } from "./tenancy-of-profile";

/**
 * How a `FluxIQWorkspaceManager` creates, keeps and drops its instances.
 *
 * - `createPrimary` builds the primary instance, synchronously, as the web
 *   runtime always has; it is never evicted.
 * - `createTenant` builds a tenant workspace's instance with its storage ready,
 *   given the custody that outlives its evictions. Required under `multi`.
 * - `removeTenantRoot` deletes a deleted tenant's storage root.
 * - `isBusy` reads the work an instance reports; the default asks
 *   `fluxiq.programs.activity()`.
 * - `idleMs` (15 minutes), `cacheMax` (100 entries, the primary included) and
 *   `sweepIntervalMs` (a minute at most; 0 starts no timer) bound what is kept.
 * - `now` is the clock; `warn` receives what an operator should see, never a
 *   key, token, cookie or unlock.
 */
export type WorkspaceManagerOptions = {
  tenancy: WorkspaceTenancy;
  primaryWorkspaceId: string;
  createPrimary(): FluxIQ;
  createTenant?(input: { workspaceId: string; heldKeys: HeldKeys; primary: FluxIQ }): Promise<FluxIQ>;
  removeTenantRoot?(input: { workspaceId: string; primary: FluxIQ }): Promise<void>;
  isBusy?(fluxiq: FluxIQ): boolean;
  idleMs?: number;
  cacheMax?: number;
  sweepIntervalMs?: number;
  now?(): number;
  warn?(message: string, fields?: Record<string, unknown>): void;
};
