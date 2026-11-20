import { environmentView } from "./environment-view";
import { readOperation } from "./read-operation";
import { refusalAnswer } from "./refusal-answer";
import type { EnvironmentChange, EnvironmentRouteAnswer, EnvironmentRouteDeps } from "./types";

/**
 * Starts, stops or deletes one environment of the caller's workspace, named
 * by the route; `rawBody` is `{ operationId }`. Starting is admitted by the
 * plan; stopping and deleting need none, so a lapsed plan can still release
 * what it holds. An environment of another workspace is refused by the
 * controller's IAM resolver and answers as not found.
 */
export async function changeEnvironment(deps: EnvironmentRouteDeps, change: EnvironmentChange, environmentId: string, rawBody: string): Promise<EnvironmentRouteAnswer> {
  const operation = readOperation(rawBody);
  if (operation === null || (operation.environmentId !== null && operation.environmentId !== environmentId)) {
    return { status: 400, body: { ok: false, code: "environments.invalid_request", error: "Send an operationId." } };
  }
  try {
    const record = await deps.controller[change]({ operationId: operation.operationId, environmentId, workspaceId: deps.workspaceId, actor: deps.actor });
    return { status: 200, body: { ok: true, environment: environmentView(record) } };
  } catch (error) {
    const refused = refusalAnswer(error, true);
    if (refused !== null) return refused;
    throw error;
  }
}
