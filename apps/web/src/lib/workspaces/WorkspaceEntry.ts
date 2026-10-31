import type { ClientGatewayService, FluxIQ } from "fluxiq";
import type { HeldKeys } from "fluxiq/secret-keys";

/**
 * One open workspace in the manager, as read: its instance, that instance's
 * client gateway, the key custody it was given, when it was last used, and
 * whether it is busy. A busy workspace is never evicted.
 *
 * `heldKeys` is the manager's custody for a tenant workspace, which outlives
 * the instance's eviction; null for the primary, which holds its own keys as
 * a single install always has. `leases` counts the callers using it now;
 * `busy` adds the work the instance reports (a run or build, a background task
 * running or scheduled by a person, an open gateway session).
 */
export type WorkspaceEntry = {
  readonly workspaceId: string;
  readonly primary: boolean;
  readonly fluxiq: FluxIQ;
  readonly gateway: ClientGatewayService;
  readonly heldKeys: HeldKeys | null;
  readonly lastUsedAt: number;
  readonly leases: number;
  readonly busy: boolean;
};

/**
 * A workspace held for one caller: its instance stays open, and the workspace
 * is not evicted, until `release` is called. `release` is idempotent; a
 * caller that never releases pins the workspace.
 */
export type WorkspaceLease = {
  workspaceId: string;
  fluxiq: FluxIQ;
  release(): void;
};
