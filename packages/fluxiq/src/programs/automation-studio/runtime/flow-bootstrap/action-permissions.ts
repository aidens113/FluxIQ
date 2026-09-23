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
// A build that finishes while carrying an unanswered request is proposed with
// the request on it. The person is asked before anything is applied, never
// instead of getting a Flow:
// `assertAutomationStudioBootstrapPermissionRequestAnswered` is what stops an
// unanswered one reaching a replay, where there is no gate.

import { AutomationStudioActionPermissionGate, type AutomationStudioActionPermissionCheck, type AutomationStudioActionPermissionRequest, type AutomationStudioInstructedConsequence } from "../action-permissions/index.ts";
import type { AutomationStudioHarnessOptionLoopBinding, AutomationStudioLlmEvidenceLoopAccounting, AutomationStudioLlmEvidenceLoopInput, AutomationStudioLlmEvidenceLoopTrace } from "../llm/index.ts";
import type { AutomationStudioAsk, AutomationStudioParkingPort } from "../parking/index.ts";
import { flowBootstrapPermissionRequiredFailure, type AutomationStudioFlowBootstrapFailureDiagnostic, type AutomationStudioFlowBootstrapGenerationError } from "./generation-failure.ts";

/**
 * How long a build waits for an answer, for a caller that waits at all.
 *
 * Short on purpose. A build holds a provider grant and its caller's request
 * open while it waits, so this is the cost of nobody being there, paid once per
 * build. A person watching the thread answers in seconds; one who is not never
 * had a build to rescue. A caller with nobody in front of it passes no timeout
 * and does not wait -- the question is still asked, and the answer releases the
 * proposal it comes back to.
 */
export const AUTOMATION_STUDIO_FLOW_BOOTSTRAP_PERMISSION_ASK_TIMEOUT_MS = 120_000;

/**
 * How long a build waits, or nothing when it opens the question and carries on.
 *
 * Capped at the default rather than taken as given. The caller decides *whether*
 * to wait; how long a build may be held open is Core's, because a caller asking
 * for a week would hold a provider grant and its own request for a week.
 */
function askWaitMs(timeoutMs: number | undefined): number | undefined {
  if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs) || timeoutMs <= 0) return undefined;
  return Math.min(Math.round(timeoutMs), AUTOMATION_STUDIO_FLOW_BOOTSTRAP_PERMISSION_ASK_TIMEOUT_MS);
}

/** Where a build's permission question goes, and where its answer comes back from. */
export type AutomationStudioFlowBootstrapPermissionAsk = {
  port: AutomationStudioParkingPort;
  /** Absent, or not positive, opens the question without waiting for it. */
  timeoutMs?: number | undefined;
  /** The build's own cancellation, so a cancelled build stops waiting. */
  signal?: AbortSignal | undefined;
  now?: (() => number) | undefined;
};

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
      if (!(await askedAndGranted(input.ask, request))) {
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
    endedOnRequest: (progress, accounting) => gate.request
      ? flowBootstrapPermissionRequiredFailure(gate.request, progress ?? NO_LOOP_PROGRESS, accounting)
      : undefined
  };
}

/** What a build that ran no evidence loop has to show for itself: nothing, honestly. */
const NO_LOOP_PROGRESS: { trace: readonly AutomationStudioLlmEvidenceLoopTrace[]; accounting: Readonly<AutomationStudioLlmEvidenceLoopAccounting> } = Object.freeze({
  trace: Object.freeze([]),
  accounting: Object.freeze({ iterations: 0, toolCalls: 0, evidenceBytes: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 })
});

/**
 * Puts one request to a person and waits, or carries on without an answer.
 *
 * A thread that cannot be written to, or a port with no way to wait, leaves the
 * build with the refusal it already had. That is deliberately not the parking
 * port's own rule, where a question that reached nobody fails the run: a build
 * that loses its Flow over an unreachable thread is worse than a build that
 * proposes one and says a person still has to answer.
 */
async function askedAndGranted(ask: AutomationStudioFlowBootstrapPermissionAsk, request: AutomationStudioActionPermissionRequest): Promise<boolean> {
  const now = ask.now ?? Date.now;
  const waitMs = askWaitMs(ask.timeoutMs);
  // The ask always says what it would wait for, whether or not this build does:
  // the row is how a person reads the question and how it expires if nobody
  // answers, and neither of those is this process's business.
  const timeoutMs = waitMs ?? AUTOMATION_STUDIO_FLOW_BOOTSTRAP_PERMISSION_ASK_TIMEOUT_MS;
  const raised: AutomationStudioAsk = {
    // The request's own id, which its payload already calls the key a store
    // would hold it under. Nothing invents a second one.
    askId: request.requestId,
    kind: "permission",
    // True whether or not this build waits. `parks` is what tells a person that
    // answering releases something, and it does either way: the build while it
    // waits, and the proposal it produced afterwards, which cannot be approved
    // or applied until this is granted.
    parks: true,
    timeoutMs,
    onTimeout: "deny",
    options: null,
    routes: null,
    consequences: [...request.consequences],
    missing: [...request.missing],
    control: { name: request.control.name, kind: request.control.kind },
    permissionRequest: request,
    status: "pending",
    text: request.sentence,
    raisedBy: { stage: "authoring", definitionId: request.action.id }
  };
  try {
    await ask.port.open(raised);
    if (waitMs === undefined) return false;
    const answer = await ask.port.awaitAnswer?.(raised, {
      expiresAtMs: now() + waitMs,
      ...(ask.signal ? { signal: ask.signal } : {})
    });
    return answer?.kind === "grant";
  } catch {
    return false;
  }
}
