import { DeletionPending, PaymentProviderUnavailableError } from "fluxiq/platform";
import type { CommerceBillingService, PlatformServicesOptions, PlatformStore } from "fluxiq/platform";
import type { FluxIQ } from "fluxiq";
import type { FluxIQWorkspaceManager } from "../../../lib/workspaces";
import { purgeEnvironments } from "./purge-environments";
import type { EnvironmentPurgeSources } from "./purge-environments";
import { createConnectedClientRevoker } from "./revoke-connected-clients";
import type { ConnectedClientRevokerDeps } from "./revoke-connected-clients";

type CascadePortNames = "revokeConnectedClients" | "dropWorkspaceCustody" | "closeBilling" | "purgeEnvironments" | "deleteWorkspaceData";

/** The provisioning ports a deletion and a membership change run through. */
export type CascadePorts = Required<Pick<PlatformServicesOptions, CascadePortNames>>;

/**
 * What the ports reach, resolved on each call so a reload is followed:
 *
 * - `primary`: the FluxIQ instance this composition belongs to;
 * - `manager`, `current`: the web server's workspace manager, and whether
 *   it and `primary` are still the running ones;
 * - `store`: the platform store (an existing workspace has a row);
 * - `listActiveForUser`: the browser-trust authority's bindings of a person;
 * - `billing`: the commerce billing service, or null when nothing is billed;
 * - `purgeEnvironments`: the environments step; by default the hosted
 *   environment controller's account and workspace purges
 *   (`purgeEnvironments`), a no-op when this server bills nothing.
 */
export type CascadePortSources = {
  primary: FluxIQ;
  manager(): FluxIQWorkspaceManager;
  current(): boolean;
  store(): Promise<Pick<PlatformStore, "getWorkspace">>;
  listActiveForUser: ConnectedClientRevokerDeps["listActiveForUser"];
  billing(): Promise<Pick<CommerceBillingService, "closeAccount"> | null>;
  purgeEnvironments?: CascadePorts["purgeEnvironments"];
};

/**
 * The web server's cascade ports for provisioning:
 *
 * - connected clients are revoked through the gateway that owns each one
 *   (`createConnectedClientRevoker`);
 * - custody is dropped in the tenant's key custody (`dropUserCustody`);
 * - billing is closed by the commerce service when this server bills, with
 *   a provider outage turned into `DeletionPending`;
 * - a personal workspace is deleted by the manager (closed, custody revoked,
 *   root removed), with a busy workspace turned into `DeletionPending`, so
 *   the run in it keeps going and the sweep finishes the deletion after it.
 */
export function composeCascadePorts(sources: CascadePortSources): CascadePorts {
  const revoke = createConnectedClientRevoker({
    get tenancy() {
      return sources.manager().tenancy;
    },
    get primaryWorkspaceId() {
      return sources.manager().primaryWorkspaceId;
    },
    primaryGateway: () => sources.primary.programs.clientGateway,
    listActiveForUser: (userId) => sources.listActiveForUser(userId),
    holdWorkspace: async (workspaceId) => {
      const manager = sources.manager();
      const lease = await manager.acquireExisting(workspaceId, {
        current: () => sources.current(),
        exists: async () => (await (await sources.store()).getWorkspace(workspaceId))?.workspaceId === workspaceId
      });
      return lease === null ? null : { gateway: lease.fluxiq.programs.clientGateway, release: () => lease.release() };
    }
  });
  return {
    revokeConnectedClients: revoke,
    dropWorkspaceCustody: async (workspaceId, userId) => {
      sources.manager().dropUserCustody(workspaceId, userId);
    },
    closeBilling: async (accountId, operationId) => {
      const billing = await sources.billing();
      if (billing === null) return;
      try {
        await billing.closeAccount(accountId, operationId);
      } catch (error) {
        if (error instanceof PaymentProviderUnavailableError) throw new DeletionPending("provider_unavailable", "Closing billing must wait: the payment provider did not answer.", { cause: error });
        throw error;
      }
    },
    purgeEnvironments: sources.purgeEnvironments ?? purgeEnvironments(hostedEnvironments(sources)),
    deleteWorkspaceData: async (workspaceId) => {
      const manager = sources.manager();
      if (manager.tenancy !== "multi") return;
      try {
        await manager.deleteWorkspace(workspaceId);
      } catch (error) {
        if (isWorkspaceBusy(error)) throw new DeletionPending("workspace_busy", "Deleting the workspace must wait: it has work in flight.", { cause: error });
        throw error;
      }
    }
  };
}

/**
 * The hosted controller and the environment records under this primary's
 * root. Hosted environments exist only where something is billed, so the
 * billing source answers first and a server that bills nothing never loads
 * or composes the controller.
 */
function hostedEnvironments(sources: CascadePortSources): EnvironmentPurgeSources {
  return {
    controller: async () => (await sources.billing()) === null ? null : (await import("../../environments/hosted")).getHostedEnvironmentController(),
    records: async () => (await import("../../environments")).getEnvironmentStore(sources.primary.paths.fluxiq)
  };
}

/** The manager refuses to delete a workspace with work in flight with a `workspaces.busy` error. */
function isWorkspaceBusy(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith("workspaces.busy");
}
