import { environmentView } from "./environment-view";
import type { EnvironmentRouteAnswer, EnvironmentRouteDeps } from "./types";

/** The caller's workspace's dedicated browsers, the deleted ones left out. Only this workspace's records are ever read. */
export async function listEnvironments(deps: Pick<EnvironmentRouteDeps, "workspaceId" | "environments">): Promise<EnvironmentRouteAnswer> {
  const records = await deps.environments.listByWorkspace(deps.workspaceId);
  const live = records.filter((record) => record.workspaceId === deps.workspaceId && !(record.desired === "deleted" && record.observed === "deleted"));
  return { status: 200, body: { ok: true, environments: live.map(environmentView) } };
}
