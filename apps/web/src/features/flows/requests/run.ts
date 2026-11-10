/**
 * `run-runtime-session`'s payload for a whole run from the start. `newRunId` names the run before
 * it begins, so the page can link to it in Runs while it goes and read it back if the request
 * itself is cut short (`run-requests/run-session.ts`). `start-runtime-session` only queues a run
 * without running it, so Run uses this endpoint.
 */
export function runPayload(flow: { projectId: string; flowId: string }, inputs: Record<string, unknown>, newRunId: string): Record<string, unknown> {
  return {
    projectId: flow.projectId,
    flowId: flow.flowId,
    newRunId,
    ...(Object.keys(inputs).length ? { inputs } : {})
  };
}
