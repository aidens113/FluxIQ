// What `start-runtime-session` does with a request: opens a run of a Flow
// without running it, from the fields a caller may name and nothing else, and
// answers with the run's session.

import { automationStudioWithWholeAttemptInputs } from "../../../../engine/automation/node-execution/index.ts";
import type { AutomationStudioService } from "../../service.ts";

type StartInput = Parameters<AutomationStudioService["startRuntimeSession"]>[0];

/**
 * The start input fields a body may set. The run's id and its metadata are
 * Core's own: a run named by the caller is `run-runtime-session`'s `newRunId`,
 * and what a session's metadata records is written by the run itself.
 */
const START_REQUEST_FIELDS = ["projectId", "flow", "flowId", "targetKind", "targetId", "inputs", "authorizedDomainIds"] as const satisfies ReadonlyArray<keyof StartInput>;

export async function startRuntimeSessionForRequest(
  service: Pick<AutomationStudioService, "startRuntimeSession">,
  request: { payload?: unknown }
) {
  const body = request.payload && typeof request.payload === "object" ? request.payload as Record<string, unknown> : {};
  const input: StartInput = {};
  for (const field of START_REQUEST_FIELDS) if (body[field] !== undefined) Object.assign(input, { [field]: body[field] });
  return { ok: true, payload: { runtimeSession: automationStudioWithWholeAttemptInputs(await service.startRuntimeSession(input)) } };
}
