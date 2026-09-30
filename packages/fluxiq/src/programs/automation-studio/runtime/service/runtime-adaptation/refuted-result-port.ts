// The run service's half of repairing a wrong answer: route it, build the edit
// with what the check said, apply it, and record every attempt.
//
// It was a closure inside `runRuntimeSession` (`runtime/service.ts`), which is
// at its line ratchet, and the closure dropped the one thing the repair most
// needed: it called the build with a Flow id, a mode and its caller, and the
// check's findings and advice -- present in the port's own input -- went no
// further (`run-mulwm2dc-0bd95f22`). Moved here so that what the build is
// handed is one readable function rather than one line of a six-thousand-line
// class, and so it can be asserted without standing up a service.
//
// **What the build is handed now.** The brief (`recovery/refuted-result/brief.ts`):
// what the run stored, Core's findings and fix, the check's own reading, every
// earlier attempt on this run and what it produced, and the instruction to put
// each qualifying clause of the request into the parameters of the step that
// reads the items. It rides beside the person's own instructions on every
// decision of the build, and it is never stored.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowInstruction, AutomationStudioFlowRunDetail } from "../../../model/index.ts";
import { automationStudioFlowBootstrapFailureDiagnosticOf, flowBootstrapPhaseFailure, type AutomationStudioFlowBootstrapFailureDiagnostic } from "../../flow-bootstrap/index.ts";
import type { AutomationStudioActionConsequence } from "../../action-permissions/index.ts";
import type { AutomationStudioLlmModelCaller } from "../../llm/index.ts";
import {
  automationStudioReauthorBrief,
  automationStudioReauthorRefutedResult,
  automationStudioRefutedResultDegraded,
  automationStudioRefutedResultReauthorDecision,
  automationStudioRefutedResultReauthored,
  type AutomationStudioRefutedResultFailure,
  type AutomationStudioRefutedResultRepairPort
} from "../../recovery/refuted-result/index.ts";
import type { AutomationStudioGenerateFlowBootstrapAdaptationInput, AutomationStudioGenerateFlowBootstrapAdaptationResult } from "../flow-bootstrap-commands/index.ts";

type RepairRequest = Parameters<AutomationStudioRefutedResultRepairPort>[0];

/** What the service lends the port: its reads, its build, and its review. */
export type AutomationStudioRefutedResultRepairPortDependencies = {
  projectId?: string | null | undefined;
  /** The Flow the run executed, when the adaptation context named it. Read when the port is called, because the context is resolved after the port is built. */
  flowId(): string | null | undefined;
  /** The person the run was made for, whose key the build pays with too. Absent for a run nobody asked the model into. */
  caller?: AutomationStudioLlmModelCaller | undefined;
  /** The lasting consequences the run's caller already allowed, carried into the build. */
  permittedConsequences?: readonly AutomationStudioActionConsequence[] | undefined;
  /** The ladder's annotation, for a refutation the route does not take. */
  annotate(request: RepairRequest): Promise<AutomationStudioFlowRunDetail>;
  /** The build, run-owned, with the brief beside the Flow's own instructions. */
  generate(request: AutomationStudioGenerateFlowBootstrapAdaptationInput, brief: AutomationStudioFlowInstruction): Promise<AutomationStudioGenerateFlowBootstrapAdaptationResult>;
  approve(input: { projectId: string; flowId: string; adaptationId: string; actorId: string }): Promise<unknown>;
  /** Applies the approved adaptation; the run then replays the Flow it produced. */
  apply(input: { projectId: string; flowId: string; adaptationId: string; actorId: string }): Promise<unknown>;
  now?: () => number;
};

/** The actor every re-author is reviewed and applied as. */
const REPAIR_ACTOR = "runtime.result_repair";

/** The port the verification calls for a refuted run. */
export function automationStudioRefutedResultRepairPort(deps: AutomationStudioRefutedResultRepairPortDependencies): AutomationStudioRefutedResultRepairPort {
  const now = deps.now ?? Date.now;
  return async (refuted) => {
    const flowId = deps.flowId();
    const decision = automationStudioRefutedResultReauthorDecision({ detail: refuted.detail, ...(deps.projectId ? { projectId: deps.projectId } : {}), ...(flowId ? { flowId } : {}) });
    if (!decision.route) return automationStudioRefutedResultReauthored({ detail: await deps.annotate(refuted), decision, attempt: refuted.current.attempt });
    const brief = automationStudioReauthorBrief({ projectId: decision.projectId, flowId: decision.flowId, current: refuted.current, history: refuted.history, maxAttempts: refuted.maxAttempts, now: now() });
    const build = () => automationStudioReauthorRefutedResult({
      now,
      generate: async () => {
        // Repairing is the automation's own work, so the build needs nothing
        // but somebody's key to pay with: the run's own caller's. A run nobody
        // asked the model into has none, and that is named rather than thrown
        // plainly.
        const caller = deps.caller;
        if (!caller) throw flowBootstrapPhaseFailure("provider_resolution", undefined, "flow_bootstrap.provider_resolution_failed");
        const generated = await deps.generate({
          projectId: decision.projectId, flowId: decision.flowId, mode: "extend", evidenceGuided: true,
          caller: { actorUserId: caller.actorUserId, actorSessionId: caller.actorSessionId },
          ...(deps.permittedConsequences?.length ? { permittedConsequences: [...deps.permittedConsequences] } : {})
        }, brief);
        return { adaptationId: generated.adaptationId, accounting: { ...generated.accounting } };
      },
      approve: (adaptationId) => deps.approve({ projectId: decision.projectId, flowId: decision.flowId, adaptationId, actorId: REPAIR_ACTOR }),
      apply: (adaptationId) => deps.apply({ projectId: decision.projectId, flowId: decision.flowId, adaptationId, actorId: REPAIR_ACTOR }),
      failureCode: (error) => automationStudioRefutedResultFailureOf(automationStudioFlowBootstrapFailureDiagnosticOf(error, "pre_provider_validation"))
    });
    const record = (detail: AutomationStudioFlowRunDetail, built: Awaited<ReturnType<typeof build>>) => automationStudioRefutedResultReauthored({
      detail,
      decision,
      ...built,
      attempt: refuted.current.attempt,
      brief: briefRecord(refuted, brief)
    });
    let built = await build();
    let repaired = record(refuted.detail, built);
    // A build that failed for a reason that may pass is built again once, and
    // both builds are on the run.
    if (!built.adaptationId && built.failure?.retryable === true) {
      built = await build();
      repaired = record(repaired, built);
    }
    // A build that produced no edit at all degrades to the smaller repair --
    // the patch ladder a refutation the route does not take is given -- rather
    // than ending the repair with nothing tried (`run-mulxk0ro-36bf090d`).
    if (!built.adaptationId && built.failure) return await degradeToPatchLadder(deps, refuted, repaired, built.failure.code);
    return repaired;
  };
}

/**
 * The run after the re-author built nothing: annotated by the patch ladder,
 * with the degradation recorded on the re-author marker. A ladder that throws
 * in turn leaves the re-author's record standing and says that too, so the
 * repair still ends having said what it tried.
 */
async function degradeToPatchLadder(
  deps: AutomationStudioRefutedResultRepairPortDependencies,
  refuted: RepairRequest,
  repaired: AutomationStudioFlowRunDetail,
  afterCode: string
): Promise<AutomationStudioFlowRunDetail> {
  try {
    const annotated = await deps.annotate({ ...refuted, detail: repaired });
    return automationStudioRefutedResultDegraded(annotated, { to: "patch_ladder", afterCode });
  } catch {
    return automationStudioRefutedResultDegraded(repaired, { to: "patch_ladder", afterCode, failed: true });
  }
}

/**
 * A failed build, as the run records it: the code and its closed facts, the
 * build's accounting without the provider's own words, and the loop's decision
 * rows, so a re-author that failed part way can be walked decision by decision.
 */
function automationStudioRefutedResultFailureOf(diagnostic: AutomationStudioFlowBootstrapFailureDiagnostic): AutomationStudioRefutedResultFailure {
  const accounting = diagnostic.accounting;
  return {
    code: diagnostic.code,
    stage: diagnostic.stage,
    retryable: diagnostic.retryable,
    providerInvocation: diagnostic.providerInvocation,
    providerResponse: diagnostic.providerResponse,
    ...(accounting?.providerStatus === undefined ? {} : { providerStatus: accounting.providerStatus }),
    // Numbers and identifiers only. `providerRefusal` carries the provider's
    // own sentence, which a run record never holds.
    ...(accounting ? { accounting: numericAccounting(accounting) } : {}),
    ...(diagnostic.evidenceLoop ? { evidenceLoop: JSON.parse(JSON.stringify(diagnostic.evidenceLoop)) as JsonObject } : {})
  };
}

function numericAccounting(accounting: NonNullable<AutomationStudioFlowBootstrapFailureDiagnostic["accounting"]>): JsonObject {
  return {
    requestId: accounting.requestId,
    estimatedInputTokens: accounting.estimatedInputTokens,
    ...(accounting.provider ? { provider: accounting.provider } : {}),
    ...(accounting.model ? { model: accounting.model } : {}),
    ...(accounting.inputTokens === undefined ? {} : { inputTokens: accounting.inputTokens }),
    ...(accounting.outputTokens === undefined ? {} : { outputTokens: accounting.outputTokens }),
    ...(accounting.totalTokens === undefined ? {} : { totalTokens: accounting.totalTokens }),
    ...(accounting.estimatedCostUsd === undefined ? {} : { estimatedCostUsd: accounting.estimatedCostUsd })
  };
}

/** What the build was told, as the run keeps it: which refutation it answered, and how big the brief was. Never the brief's text, which carries the check's prose. */
function briefRecord(refuted: RepairRequest, brief: AutomationStudioFlowInstruction): JsonObject {
  return {
    instructionId: brief.instructionId,
    chars: brief.body.length,
    findingCodes: (refuted.current.directive?.findings ?? []).map((finding) => finding.code),
    fixLines: refuted.current.directive?.fix.length ?? 0,
    advised: Boolean(refuted.current.directive?.judgement?.advice),
    earlierAttempts: refuted.history.length
  };
}
