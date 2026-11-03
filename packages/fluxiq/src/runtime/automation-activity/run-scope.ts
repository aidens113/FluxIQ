import { automationStudioActivityStorage } from "./storage.ts";

/**
 * The run the current async context belongs to, once its session is admitted
 * and bound (`./bind.ts`): the project and run id, or nothing in a build, in a
 * run not yet bound, or outside any unit of work. The host hands it to the
 * client gateway as `commandOwner`, so an action result that comes after Core
 * stopped waiting for its command is put on the run that sent it.
 */
export function automationStudioActivityRunScope(): { projectId: string; runId: string } | undefined {
  const frame = automationStudioActivityStorage.getStore();
  if (!frame || frame.pending || frame.scope.kind !== "run") return undefined;
  return { projectId: frame.scope.projectId, runId: frame.scope.id };
}
