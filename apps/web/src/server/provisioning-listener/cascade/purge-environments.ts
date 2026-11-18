import { DeletionPending } from "fluxiq/platform";
import type { EnvironmentController, EnvironmentStore, PlatformServicesOptions } from "fluxiq/platform";

type EnvironmentPurgeRequest = Parameters<NonNullable<PlatformServicesOptions["purgeEnvironments"]>>[0];

/** Where the purge reaches: the hosted controller (null when nothing is billed) and the environment records. */
export type EnvironmentPurgeSources = {
  controller(): Promise<Pick<EnvironmentController<unknown>, "purgeAccount" | "purgeWorkspace"> | null>;
  records(): Promise<Pick<EnvironmentStore, "listByAccount" | "listByWorkspace">>;
};

/**
 * The deletion cascade's environments step: releases and erases every
 * dedicated environment of the account, then of each deleted workspace,
 * under the deletion receipt's id, so a retry finishes a partial purge.
 *
 * - nothing billed (no controller): there are no hosted environments, a no-op;
 * - a controller that cannot be composed (no driver or region configured):
 *   a no-op when the account and workspaces hold no environment records,
 *   otherwise `DeletionPending`, since records it cannot release must wait;
 * - a driver failure part-way: `DeletionPending`, and the sweep repeats it.
 */
export function purgeEnvironments(sources: EnvironmentPurgeSources): (request: EnvironmentPurgeRequest) => Promise<void> {
  return async (request) => {
    let controller: Awaited<ReturnType<EnvironmentPurgeSources["controller"]>>;
    try {
      controller = await sources.controller();
    } catch (error) {
      if (!(await holdsRecords(sources, request))) return;
      throw new DeletionPending("environments_pending", "Deleting the dedicated environments must wait: their controller is not available.", { cause: error });
    }
    if (controller === null) return;
    try {
      await controller.purgeAccount(request.accountId, request.operationId);
      for (const workspaceId of request.workspaceIds) await controller.purgeWorkspace(workspaceId, request.operationId);
    } catch (error) {
      if (error instanceof AggregateError) throw new DeletionPending("environments_pending", "Deleting the dedicated environments must wait: some could not be released yet.", { cause: error });
      throw error;
    }
  };
}

async function holdsRecords(sources: EnvironmentPurgeSources, request: EnvironmentPurgeRequest): Promise<boolean> {
  const records = await sources.records();
  if ((await records.listByAccount(request.accountId)).length > 0) return true;
  for (const workspaceId of request.workspaceIds) if ((await records.listByWorkspace(workspaceId)).length > 0) return true;
  return false;
}
