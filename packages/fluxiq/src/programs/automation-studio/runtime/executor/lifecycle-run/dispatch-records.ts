// The records one handler run leaves (state-aware recovery plan, C11).
//
// This module owns turning one run, or one refusal, into the three records
// it leaves: the attempt's `lifecycle` record, the runtime stream's
// `handler_execution` record, and the chat's `recovery` row, which it emits
// through the step-recovery emitter. Ids, closed codes, truths, evidence
// references and an authored label only: never page text or resolved values.

import type { ClientGatewayActivityRecovery } from "@fluxiq/contracts/client-gateway";
import type { AutomationStudioFlowRunHandlerExecutionRecord } from "../../../model/index.ts";
import type { AutomationStudioLifecycleEvent } from "../../../nodes/control-flow/index.ts";
import { emitAutomationStudioActivityStepRecovery } from "../../activity/step/index.ts";
import type { AutomationStudioLifecycleTrace, AutomationStudioLifecycleTraceDisposition } from "../contracts.ts";
import type { AutomationStudioDispositionDecision, AutomationStudioFactConditionResult, AutomationStudioFactTruth } from "../lifecycle/index.ts";
import { automationStudioConditionEvidence } from "./condition-evidence.ts";

/** What a card says for a handler with no authored label. */
const HANDLER_SUBJECT = "A recovery step";

/** The longest subject a recovery row carries, as Core truncates it on the wire. */
const SUBJECT_LIMIT = 160;

/**
 * The records of one handler run. `ran` is false for a refusal: the body never
 * ran, so there is no attempt `lifecycle` record and both the stream record and
 * the row say `refused`. `bodyFailed` is true when the body ran and failed
 * inside it. The row says `succeeded` only when the decision moved the run on
 * (`resume`, `route`, `resolve`); a body that finished but whose completion
 * check did not hold reads `failed` on the row and `succeeded` on the stream
 * record, which is about the body alone. A `quiet` refusal -- a handler that
 * already ran for this occurrence or incident -- keeps its stream record and
 * emits no row.
 */
export function automationStudioLifecycleRunRecords(input: {
  executionId: string;
  event: AutomationStudioLifecycleEvent;
  handlerId: string;
  framePath: readonly string[];
  nodeId: string;
  incidentId?: string;
  occurrence: string;
  when: readonly AutomationStudioFactConditionResult[];
  completionCheck: AutomationStudioFactTruth;
  decision: AutomationStudioDispositionDecision;
  ran: boolean;
  bodyFailed: boolean;
  startedAt: number;
  finishedAt: number;
  label?: string;
  targetId?: string;
  quiet?: boolean;
}): { lifecycle?: AutomationStudioLifecycleTrace; execution: AutomationStudioFlowRunHandlerExecutionRecord; recovery: ClientGatewayActivityRecovery } {
  const disposition = traceDisposition(input.decision);
  const execution: AutomationStudioFlowRunHandlerExecutionRecord = {
    executionId: input.executionId,
    handlerId: input.handlerId,
    event: input.event,
    framePath: [...input.framePath],
    nodeId: input.nodeId,
    ...(input.incidentId ? { incidentId: input.incidentId } : {}),
    disposition: streamDisposition(disposition),
    outcome: !input.ran ? "refused" : input.bodyFailed ? "failed" : "succeeded",
    startedAt: input.startedAt,
    finishedAt: input.finishedAt
  };
  const moved = input.decision.kind === "resume" || input.decision.kind === "route" || input.decision.kind === "resolve";
  const recovery: ClientGatewayActivityRecovery = {
    kind: "handler",
    subject: (input.label?.trim() || HANDLER_SUBJECT).slice(0, SUBJECT_LIMIT),
    outcome: !input.ran ? "refused" : moved ? "succeeded" : "failed",
    event: input.event,
    ...(input.targetId ? { targetId: input.targetId } : {})
  };
  if (!input.quiet) emitAutomationStudioActivityStepRecovery({ nodeId: input.nodeId, recovery });
  if (!input.ran) return { execution, recovery };
  const lifecycle: AutomationStudioLifecycleTrace = {
    event: input.event,
    handlerId: input.handlerId,
    occurrence: input.occurrence,
    conditionEvidence: input.when.map(automationStudioConditionEvidence),
    disposition,
    completionCheck: input.completionCheck
  };
  return { lifecycle, execution, recovery };
}

/**
 * The decision as the attempt's `lifecycle` record keeps it: a `resolve` keeps
 * no outputs, an `unhandled` keeps its closed code and the guard that refused
 * a route, and a Core stop is not a way on, so it reads `unhandled` with
 * `core_stop`.
 */
function traceDisposition(decision: AutomationStudioDispositionDecision): AutomationStudioLifecycleTraceDisposition {
  switch (decision.kind) {
    case "resume":
      return { kind: "resume" };
    case "route":
      return { kind: "route", checkpointId: decision.checkpointId };
    case "resolve":
      return { kind: "resolve" };
    case "unhandled":
      return { kind: "unhandled", reason: decision.code, ...(decision.guard ? { guard: decision.guard } : {}) };
    case "stop":
      return { kind: "unhandled", reason: "core_stop" };
  }
}

/**
 * The decision as the runtime stream's `handler_execution` record keeps it
 * (`model/flow-adaptation.ts`): the same as the attempt's record, so an
 * `unhandled` keeps its closed reason and the guard that refused a route
 * (t416). It once kept the kind alone, and a stored run could not say why.
 */
function streamDisposition(disposition: AutomationStudioLifecycleTraceDisposition): AutomationStudioFlowRunHandlerExecutionRecord["disposition"] {
  return disposition.kind === "unhandled" ? { kind: "unhandled", ...(disposition.reason ? { reason: disposition.reason } : {}), ...(disposition.guard ? { guard: disposition.guard } : {}) } : disposition;
}
