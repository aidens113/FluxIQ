// The candidate start hook, recorded (D1, P2a section 3): the hook is an input
// that reaches Core outside the client gateway's socket -- an HTTP answer from
// the deployment's reset -- so its request identity and its answer, or the
// kind of its failure, are recorded as a control event into the episode the
// hook is called from. The trial ports call it before a trial opens its own
// episode, so it lands in the build's trace. The hook's bearer token is the
// hook's own and never reaches here; the lease is recorded by its identity.

import type { AutomationStudioPrepareCandidateStart } from "../../service/candidate-trial/index.ts";
import type { AutomationStudioGatewayTraceEpisodes } from "../episodes.ts";

type StartInput = Parameters<AutomationStudioPrepareCandidateStart>[0];

/** `hook`, recording each call's request identity and outcome into the calling episode's trace. */
export function automationStudioGatewayTraceStartHook(hook: AutomationStudioPrepareCandidateStart, episodes: AutomationStudioGatewayTraceEpisodes): AutomationStudioPrepareCandidateStart {
  return async (input) => {
    const episode = episodes.current();
    const request = requestIdentity(input);
    let answer: Awaited<ReturnType<AutomationStudioPrepareCandidateStart>>;
    try {
      answer = await hook(input);
    } catch (error) {
      const errorKind = error instanceof Error ? error.name : typeof error;
      if (episode !== undefined) episodes.recordControl({ type: "start_hook_answer", payload: { request, outcome: "failed", errorKind } }, episode);
      throw error;
    }
    if (episode !== undefined) episodes.recordControl({ type: "start_hook_answer", payload: { request, outcome: "answered", answer } }, episode);
    return answer;
  };
}

/** What the hook was asked: the candidate and its start, and the lease by its identity. */
function requestIdentity(input: StartInput): Record<string, unknown> {
  const lease = input.lease === undefined ? null : { resourceKey: input.lease.resourceKey, epoch: input.lease.epoch, sessionId: input.lease.sessionId ?? null, holder: { role: input.lease.holder.role, briefId: input.lease.holder.briefId } };
  return {
    projectId: input.projectId,
    flowId: input.flowId,
    candidateId: input.candidateId,
    revision: input.revision,
    digest: input.digest,
    startLocation: input.startLocation ?? null,
    lease
  };
}
