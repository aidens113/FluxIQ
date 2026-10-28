// The subflow trial gate's offline-first check (trace plan P6, t769;
// `./subflow-trial-gate.ts`, header): the port's `offlineFirst`, asked before
// anything is done on the site and timed as its own `NNNN-offline` step.
//
// A failure the recording demonstrates (`../offline-first/gate-step.ts`) is
// kept only when it also meets the gate's own result checks
// (`./subflow-trial-result.ts`): this brief's subflow, revision and digest, its
// entry prepared, a trial the port says it ran, and a verdict of no or
// execution_failed. Its acts are dropped: nothing landed on the site. Anything
// else runs live: a kept answer that fails those checks is an invalid answer
// as the gate step says one, and a check that threw runs live the same way,
// its error never shown. An abort propagates. A check not tried (no recording
// yet) is logged and adds nothing to the evidence (D46).
import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioLlmStepLogOfflineTrial } from "../../llm/step-log/index.ts";
import { automationStudioTrialOfflineFirstStep } from "../offline-first/index.ts";
import type { AutomationStudioSubflowScopeIdentity, AutomationStudioSubflowTrialPort, AutomationStudioSubflowTrialRequest, AutomationStudioSubflowTrialResult } from "./contracts.ts";
import { automationStudioSubflowTrialResultRead } from "./subflow-trial-result.ts";

type Read = ReturnType<typeof automationStudioSubflowTrialResultRead>;

/**
 * What the gate does after the check: `keep`, weigh `asked` as the trial's
 * answer, put `said` before its instruction and add `evidence`, with nothing
 * done on the site; `live`, run today's trial and add `evidence`.
 */
export async function automationStudioSubflowTrialOfflineFirstCheck(input: {
  offlineFirst: NonNullable<AutomationStudioSubflowTrialPort["offlineFirst"]>;
  request: AutomationStudioSubflowTrialRequest;
  identity: AutomationStudioSubflowScopeIdentity;
  trialToolId: string;
}): Promise<{ kind: "keep"; asked: Read; said: string; evidence: JsonObject } | { kind: "live"; evidence: JsonObject }> {
  const { request } = input;
  const expected = { revision: request.proposal.revision, digest: request.proposal.digest };
  const { outcome, asked } = await automationStudioLlmStepLogOfflineTrial({ trialToolId: input.trialToolId }, async () => {
    let raw: unknown;
    try {
      raw = await input.offlineFirst(request);
    } catch (error) {
      if (request.signal.aborted) throw error;
      // A check that failed demonstrates nothing; its error text may carry recorded page detail and is never shown.
      raw = undefined;
    }
    const taken = automationStudioTrialOfflineFirstStep<AutomationStudioSubflowTrialResult>(raw, expected);
    const read = taken.kind === "keep" ? automationStudioSubflowTrialResultRead({ ...taken.result, standingNo: taken.standingNo }, input.identity, expected) : undefined;
    if (read && keepable(read)) return { outcome: taken, asked: read };
    // A kept answer the gate's own checks refuse is an invalid answer, as the gate step says one.
    return { outcome: taken.kind === "keep" ? automationStudioTrialOfflineFirstStep<AutomationStudioSubflowTrialResult>(undefined, expected) : taken };
  }, (taken) => taken.outcome.logged);
  if (outcome.kind === "keep" && asked) {
    // Nothing landed on the site: the recording's acts are not this trial's.
    delete asked.answer.acts;
    return { kind: "keep", asked, said: outcome.said, evidence: { ...outcome.evidence } };
  }
  return { kind: "live", evidence: outcome.kind === "live" && outcome.note.outcome !== "not_tried" ? { ...outcome.evidence } : {} };
}

/** Whether a kept answer, as the gate's checks read it, is a failure of this subflow the gate may keep. */
function keepable(asked: Read): boolean {
  const { answer } = asked;
  return asked.notRun === undefined && answer.entryPrepared && (answer.verdict === "no" || answer.verdict === "execution_failed");
}
