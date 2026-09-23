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
// **An exploration refusal is recoverable; a plan refusal ends the build.** The
// two are not the same event and used to be treated as one. An exploration step
// the build is not permitted comes back to the model as the domain wrote it --
// `permission_required`, carrying which classes are missing and which request
// carries them -- so the model can do something else and the build can still
// finish. It used to throw here, which ended the build at the first refusal and
// left a person asked about a build that had produced nothing. A plan step,
// by contrast, is refused inside the completion check, which the loop cannot
// see into: handing that refusal back would ask the model again for a refusal
// no rewrite can answer, so it aborts the loop's signal and the build ends on
// the request. Should the refusal instead trip the unusable-decision guard,
// that ending is read through `endedOnRequest` too. Whichever way it stops, the
// caller asks `endedOnRequest` first.
//
// **The request goes to a person, and the build waits for the answer.** The
// conversation already has a `permission` ask keyed by the request's own
// `requestId` (`runtime/conversations/ask.ts`), and a parking port that opens
// one and holds the work in place until it is settled. This is the wiring
// between them: the gate raises the request, the ask puts it in the Flow's
// thread, and a grant widens what the build holds and lets the same action go
// ahead. Nothing new was invented for it.
//
// That changes the model's incentive as much as its capability. While a
// declared consequence dead-ended in a refusal and an undeclared one did not,
// the answer that let a build finish was the dishonest one. Now declaring leads
// to being asked and the build carries on, so honesty is the cheap path.
//
// One question at a time, and at most one wait. A refusal nobody granted -- a
// person saying no, or nobody there to say anything -- is remembered, and every
// later refusal reports that same request rather than asking again. So a build
// nobody is watching costs one wait, not one per action.
//
// **What every step declared travels with the build, not only the refused one.**
// A build's proposal carries the gate's whole record and Core's cross-check of
// it against the person's own instruction (`action-permissions/cross-check.ts`).
// Until this existed a permitted declaration was discarded where it was read,
// so the one question the seam exists to answer -- what did this step say it
// would do? -- could only be deduced from the absence of a refusal.
//
// The cross-check costs a provider call the build would not otherwise make,
// and only in the case worth paying for: at least one action was put to the
// gate and not one of them declared anything lasting, so the derivation that
// reads the instruction was never triggered. A build that declared something
// has already paid for it, and a build that acted on nothing has nothing to
// compare.
//
// A build that finishes while carrying an unanswered request is proposed with
// the request on it. The person is asked before anything is applied, never
// instead of getting a Flow:
// `assertAutomationStudioBootstrapPermissionRequestAnswered` is what stops an
// unanswered one reaching a replay, where there is no gate.

import {
  AutomationStudioActionPermissionGate,
  automationStudioActionDeclarationCrossCheck,
  type AutomationStudioActionDeclarationCrossCheck,
  type AutomationStudioActionDeclarationRecord,
  type AutomationStudioActionPermissionCheck,
  type AutomationStudioActionPermissionRequest,
  type AutomationStudioInstructedConsequence
} from "../action-permissions/index.ts";
import type { AutomationStudioHarnessOptionLoopBinding, AutomationStudioLlmEvidenceLoopAccounting, AutomationStudioLlmEvidenceLoopInput, AutomationStudioLlmEvidenceLoopTrace } from "../llm/index.ts";
import { AUTOMATION_STUDIO_PERMISSION_ASK_TIMEOUT_MS, automationStudioAskedAndGranted, type AutomationStudioPermissionAsk } from "../parking/index.ts";
import { flowBootstrapPermissionRequiredFailure, type AutomationStudioFlowBootstrapFailureDiagnostic, type AutomationStudioFlowBootstrapGenerationError } from "./generation-failure.ts";

/**
 * How long a build waits for an answer, for a caller that waits at all.
 *
 * The one Core bound, under the name this path has always exported it by. The
 * mechanism and the reasoning moved to `parking/permission-ask.ts` on
 * 2026-09-22, when the repair path had to ask the same question the same way.
 */
export const AUTOMATION_STUDIO_FLOW_BOOTSTRAP_PERMISSION_ASK_TIMEOUT_MS = AUTOMATION_STUDIO_PERMISSION_ASK_TIMEOUT_MS;

/** Where a build's permission question goes, and where its answer comes back from. */
export type AutomationStudioFlowBootstrapPermissionAsk = AutomationStudioPermissionAsk;

export type AutomationStudioFlowBootstrapActionPermissions = {
  /** The domain's executor, with the build's permission check handed to every action. */
  executeTool: AutomationStudioLlmEvidenceLoopInput["executeTool"];
  /** The check for one step of the Flow being built, handed to the domain as it resolves the step. */
  planStep: (step: { definitionId: string; ref: string }) => AutomationStudioActionPermissionCheck;
  /**
   * Aborted when a *plan* step is refused, which is the refusal the loop cannot
   * see. The evidence loop runs under it. An exploration refusal leaves it
   * alone: the loop saw that one and the model may act on it.
   */
  signal: AbortSignal;
  /** What the instruction was read to ask for, once the build first needed to know; stored with what it builds. */
  instructed(): readonly AutomationStudioInstructedConsequence[] | undefined;
  /** The request a refusal raised, or `undefined` when none was. Stored with a build that finished anyway. */
  request(): AutomationStudioActionPermissionRequest | undefined;
  /** What every action put to the gate declared about itself, in the order it was asked. */
  declarations(): readonly AutomationStudioActionDeclarationRecord[];
  /**
   * What the build declared, held against what the person's instruction asks
   * for. `undefined` when no action was ever put to the gate, because a build
   * that acted on nothing has nothing to contradict.
   *
   * Called once, after the loop has stopped. It may derive the instruction's
   * authority -- one provider call -- for a build that never needed it, and
   * where a caller passed an `ask` it says the finding out loud in the same
   * thread the permission question uses. It never refuses anything.
   */
  crossCheck(): Promise<AutomationStudioActionDeclarationCrossCheck | undefined>;
  /**
   * The ending a raised request makes, or `undefined` when none was raised.
   * Read first once the loop stops: a request is why it stopped, and the loop
   * itself only saw a tool that did not come back or a signal that fired.
   */
  endedOnRequest(
    progress?: { trace: readonly AutomationStudioLlmEvidenceLoopTrace[]; accounting: Readonly<AutomationStudioLlmEvidenceLoopAccounting> },
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
  /** Absent, a refused action is refused and nobody is asked, exactly as before a thread existed. */
  ask?: AutomationStudioFlowBootstrapPermissionAsk | undefined;
  now?: () => number;
  newRequestId?: () => string;
}): AutomationStudioFlowBootstrapActionPermissions {
  const gate = new AutomationStudioActionPermissionGate({
    permittedConsequences: input.permittedConsequences,
    stage: "authoring",
    instructionIds: input.instructionIds,
    deriveInstructed: input.deriveInstructed,
    // The build puts its own request to a person, so the gate must not end it.
    endsOnRequest: false,
    now: input.now,
    newRequestId: input.newRequestId
  });
  // The gate's own signal is not what the loop runs under. The gate aborts it
  // on any refusal, which is right for the gate -- it has answered its one
  // request -- and wrong for the build, which can carry on exploring. This one
  // fires only for the refusal the loop cannot see.
  const planRefused = new AbortController();
  // One wait per build. Set the moment a request is put to a person, whatever
  // they answer, so a refusal nobody granted is never re-asked.
  let asked = false;
  /** The gate's check, with the refusal it would return put to a person first. */
  const asking = (action: { kind: "exploration_step" | "flow_step"; id: string; ref: string }): AutomationStudioActionPermissionCheck => {
    const check = gate.checkFor(action);
    return async (declaration) => {
      const decision = await check(declaration);
      const request = gate.request;
      if (decision.permitted || !input.ask || asked || !request || request.requestId !== decision.requestId) return decision;
      asked = true;
      if (!(await automationStudioAskedAndGranted(input.ask, request))) {
        gate.settle("refused");
        return decision;
      }
      gate.settle("granted");
      // Asked again rather than answered from here: the gate recomputes what is
      // missing against what it now holds, so nothing decides permission twice.
      return await check(declaration);
    };
  };
  return {
    executeTool: async (call) => {
      const permission = asking({ kind: "exploration_step", id: call.toolId, ref: call.callId });
      const execution = await input.executeTool({ ...call, permission });
      gate.observe(execution);
      // Recoverable. The domain has already turned a refusal nobody granted
      // into evidence the model can read and route around, and the request it
      // names is on the build whatever the model does next.
      return execution;
    },
    planStep: (step) => {
      const check = asking({ kind: "flow_step", id: step.definitionId, ref: step.ref });
      return async (declaration) => {
        const decision = await check(declaration);
        // The completion check is opaque to the loop, so a refusal inside it
        // has to stop the loop from here or it is asked again unanswerably.
        if (!decision.permitted) planRefused.abort();
        return decision;
      };
    },
    signal: planRefused.signal,
    instructed: () => gate.instructed,
    request: () => gate.request,
    declarations: () => gate.declarations,
    crossCheck: async () => {
      if (!gate.declarations.length) return undefined;
      const crossCheck = automationStudioActionDeclarationCrossCheck({
        declarations: gate.declarations,
        instructed: await gate.resolveInstructed()
      });
      if (crossCheck.verdict === "undeclared" && input.ask) await saidOutLoud(input.ask, crossCheck);
      return crossCheck;
    },
    endedOnRequest: (progress, accounting) => gate.request
      ? flowBootstrapPermissionRequiredFailure(gate.request, progress ?? NO_LOOP_PROGRESS, accounting)
      : undefined
  };
}

/** What a build that ran no evidence loop has to show for itself: nothing, honestly. */
const NO_LOOP_PROGRESS: { trace: readonly AutomationStudioLlmEvidenceLoopTrace[]; accounting: Readonly<AutomationStudioLlmEvidenceLoopAccounting> } = Object.freeze({
  trace: Object.freeze([]),
  accounting: Object.freeze({ iterations: 0, toolCalls: 0, evidenceBytes: 0, inputTokens: 0, cacheHitInputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 })
});

/**
 * Says a contradiction in the Flow's own thread, and does not wait.
 *
 * Not a parking ask: the build has finished and has a Flow, and the question is
 * whether to apply it, which the person answers by approving the proposal the
 * finding is recorded on. A `confirm` rather than an `open` question, so the
 * thread offers yes and no and an answer means something; `parks: false`,
 * because nothing is being held. A thread that cannot be written to loses the
 * turn and keeps the record, which is the same trade the permission ask makes.
 */
async function saidOutLoud(ask: AutomationStudioFlowBootstrapPermissionAsk, crossCheck: AutomationStudioActionDeclarationCrossCheck): Promise<void> {
  try {
    await ask.port.open({
      askId: `declaration-cross-check:${crossCheck.undeclared.join("-")}:${Math.trunc((ask.now ?? Date.now)())}`,
      kind: "confirm",
      parks: false,
      timeoutMs: null,
      onTimeout: null,
      options: null,
      routes: null,
      consequences: [...crossCheck.undeclared],
      missing: null,
      control: null,
      permissionRequest: null,
      status: "pending",
      text: `${crossCheck.sentence} Apply it as it stands?`,
      raisedBy: { stage: "authoring" }
    });
  } catch {
    /* best-effort: a thread that could not be written to is not a reason to lose the Flow, and the finding is recorded on the proposal either way. */
  }
}
