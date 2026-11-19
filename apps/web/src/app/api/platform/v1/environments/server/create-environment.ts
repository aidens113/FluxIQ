import { environmentView } from "./environment-view";
import { operationEnvironmentId } from "./operation-environment-id";
import { readOperation } from "./read-operation";
import { refusalAnswer } from "./refusal-answer";
import type { EnvironmentRouteAnswer, EnvironmentRouteDeps } from "./types";

/**
 * Creates and starts a dedicated browser in the caller's workspace, admitted
 * by the paying account's plan alone (cloud admission, through the
 * controller). `rawBody` is `{ operationId, environmentId? }`; without an
 * environment id one is derived from the operation, so a retried create is
 * the same environment. Answers once the browser runs and its client
 * enrolled at the workspace's gateway.
 */
export async function createEnvironment(deps: EnvironmentRouteDeps, rawBody: string): Promise<EnvironmentRouteAnswer> {
  const operation = readOperation(rawBody);
  if (operation === null) return { status: 400, body: { ok: false, code: "environments.invalid_request", error: "Send an operationId, and optionally an environmentId." } };
  const environmentId = operation.environmentId ?? operationEnvironmentId(deps.workspaceId, operation.operationId);
  try {
    const record = await deps.controller.create({ operationId: operation.operationId, environmentId, workspaceId: deps.workspaceId, actor: deps.actor });
    return { status: 200, body: { ok: true, environment: environmentView(record) } };
  } catch (error) {
    const refused = refusalAnswer(error, false);
    if (refused !== null) return refused;
    throw error;
  }
}
