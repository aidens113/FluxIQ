// The permission gate on the authoring path: building a Flow from nothing.
//
// Every failure measured live on the jobs that change a page was an authoring
// build, and authoring had no way to say "this needs a person": the recovery
// path at least had a stop reason for it, and a build had only `flow_bootstrap.*`
// codes for things that went wrong. So a build that needed to press a control
// with a lasting consequence either had the press refused on the domain's own
// judgement -- and ended, some calls later, as a build that made no progress --
// or had nobody stop it, and built a Flow that would take the action every time
// it ran.
//
// This puts one gate in front of both. The grant a person issued for the build
// says which consequences it may have. The domain declares, action by action,
// which ones it would: for a step the build takes now while exploring, and for
// a step the finished Flow would take each time it runs, as it resolves that
// step's parameters. The first action the build does not hold ends it with
// `flow_bootstrap.permission_required`, carrying the request, and a later
// build's grant carries the person's answer.
//
// Three ways out of the evidence loop, one ending. An exploration step throws,
// so the loop stops at the tool. A plan step is refused inside the completion
// check, which the loop cannot see into, so the gate's signal -- aborted when
// the request is raised -- stops the loop before it asks the model again. And
// should the refusal instead trip the unusable-decision guard, that ending is
// read through `endedOnRequest` too. Whichever way it stops, the caller asks
// `endedOnRequest` first.

import { AutomationStudioActionPermissionGate, type AutomationStudioActionPermissionCheck, type AutomationStudioInstructedConsequence } from "../action-permissions/index.ts";
import type { AutomationStudioHarnessOptionLoopBinding, AutomationStudioLlmEvidenceLoopAccounting, AutomationStudioLlmEvidenceLoopInput, AutomationStudioLlmEvidenceLoopTrace } from "../llm/index.ts";
import { flowBootstrapPermissionRequiredFailure, type AutomationStudioFlowBootstrapFailureDiagnostic, type AutomationStudioFlowBootstrapGenerationError } from "./generation-failure.ts";

export type AutomationStudioFlowBootstrapActionPermissions = {
  /** The domain's executor, with the build's permission check handed to every action. */
  executeTool: AutomationStudioLlmEvidenceLoopInput["executeTool"];
  /** The check for one step of the Flow being built, handed to the domain as it resolves the step. */
  planStep: (step: { definitionId: string; ref: string }) => AutomationStudioActionPermissionCheck;
  /** Aborted when a request is raised. The evidence loop runs under it. */
  signal: AbortSignal;
  /** What the instruction was read to ask for, once the build first needed to know; stored with what it builds. */
  instructed(): readonly AutomationStudioInstructedConsequence[] | undefined;
  /**
   * The ending a raised request makes, or `undefined` when none was raised.
   * Read first once the loop stops: a request is why it stopped, and the loop
   * itself only saw a tool that did not come back or a signal that fired.
   */
  endedOnRequest(
    progress: { trace: readonly AutomationStudioLlmEvidenceLoopTrace[]; accounting: Readonly<AutomationStudioLlmEvidenceLoopAccounting> },
    accounting?: NonNullable<AutomationStudioFlowBootstrapFailureDiagnostic["accounting"]>
  ): AutomationStudioFlowBootstrapGenerationError | undefined;
};

export function automationStudioFlowBootstrapActionPermissions(input: {
  /** From the build's grant. Absent permits nothing. */
  permittedConsequences: readonly string[] | undefined;
  /** The instructions the build carries out: the reason any action was wanted. */
  instructionIds: readonly string[];
  executeTool: AutomationStudioHarnessOptionLoopBinding["executeTool"];
  /** Reads the instruction for what it already asks for; see `instruction-authority.ts`. */
  deriveInstructed?: (() => Promise<readonly AutomationStudioInstructedConsequence[]>) | undefined;
  now?: () => number;
  newRequestId?: () => string;
}): AutomationStudioFlowBootstrapActionPermissions {
  const gate = new AutomationStudioActionPermissionGate({
    permittedConsequences: input.permittedConsequences,
    stage: "authoring",
    instructionIds: input.instructionIds,
    deriveInstructed: input.deriveInstructed,
    now: input.now,
    newRequestId: input.newRequestId
  });
  return {
    executeTool: async (call) => {
      const permission = gate.checkFor({ kind: "exploration_step", id: call.toolId, ref: call.callId });
      const execution = await input.executeTool({ ...call, permission });
      gate.observe(execution);
      // Terminal: the build ends on the first action it was not permitted,
      // rather than handing the refusal back to the model to route around.
      if (gate.raisedDuring(call.callId)) throw new Error("Flow Bootstrap stopped: an action needs permission.");
      return execution;
    },
    planStep: (step) => gate.checkFor({ kind: "flow_step", id: step.definitionId, ref: step.ref }),
    signal: gate.signal,
    instructed: () => gate.instructed,
    endedOnRequest: (progress, accounting) => gate.request ? flowBootstrapPermissionRequiredFailure(gate.request, progress, accounting) : undefined
  };
}
