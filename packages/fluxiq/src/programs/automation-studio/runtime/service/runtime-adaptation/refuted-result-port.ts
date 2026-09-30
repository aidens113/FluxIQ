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
//
// **What the repair may spend: one purse for all of it.** The re-author build,
// the build again after a failure that may pass, and the patch ladder it falls
// back to were each held to $0.25 on their own, so one repair could spend about
// $0.75. They now spend from one purse (`recovery/refuted-result/purse.ts`):
// $0.25, lowered by the Flow's own setting. Each part is handed what is left as
// its total -- the build's loop budget, the recovery's ledger -- once the parts
// before it are charged what they reported. A part with nothing left -- less
// than one more call at what the repair's calls have cost so far -- is not
// run, so it asks no model, and the run records the cost bound as the reason.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowInstruction, AutomationStudioFlowRunDetail } from "../../../model/index.ts";
import { automationStudioFlowBootstrapFailureDiagnosticOf, flowBootstrapPhaseFailure, type AutomationStudioFlowBootstrapFailureDiagnostic } from "../../flow-bootstrap/index.ts";
import type { AutomationStudioActionConsequence } from "../../action-permissions/index.ts";
import type { AutomationStudioLlmModelCaller } from "../../llm/index.ts";
import {
  AUTOMATION_STUDIO_RESULT_REPAIR_COST_BOUND_CODE,
  automationStudioReauthorBrief,
  automationStudioReauthorRefutedResult,
  automationStudioRefutedResultDegraded,
  automationStudioRefutedResultReauthorDecision,
  automationStudioRefutedResultReauthored,
  automationStudioResultRepairPurse,
  automationStudioResultRepairPurseAllowsPart,
  automationStudioResultRepairPurseCharged,
  automationStudioResultRepairPurseLeftUsd,
  automationStudioResultRepairPurseRefused,
  automationStudioResultRepairWithPurse,
  type AutomationStudioRefutedResultFailure,
  type AutomationStudioRefutedResultRepairPort,
  type AutomationStudioResultRepairPurse
} from "../../recovery/refuted-result/index.ts";
import type { AutomationStudioGenerateFlowBootstrapAdaptationInput, AutomationStudioGenerateFlowBootstrapAdaptationResult } from "../flow-bootstrap-commands/index.ts";

type RepairRequest = Parameters<AutomationStudioRefutedResultRepairPort>[0];

/** What the service lends the port: its reads, its build, and its review. */
export type AutomationStudioRefutedResultRepairPortDependencies = {
  projectId?: string | null | undefined;
  /** The Flow the run executed, when the adaptation context named it. Read when the port is called, because the context is resolved after the port is built. */
  flowId(): string | null | undefined;
  /**
   * The Flow's configured cost limit (`adaptationPolicySettings.maxEstimatedCostUsdPerRun`),
   * read when the port is called, for the same reason. It lowers the repair's
   * purse and never raises it.
   */
  maxCostUsd?: (() => number | undefined) | undefined;
  /** The person the run was made for, whose key the build pays with too. Absent for a run nobody asked the model into. */
  caller?: AutomationStudioLlmModelCaller | undefined;
  /** The lasting consequences the run's caller already allowed, carried into the build. */
  permittedConsequences?: readonly AutomationStudioActionConsequence[] | undefined;
  /**
   * The ladder's annotation, for a refutation the route does not take and for
   * a re-author that built nothing. `costLeftUsd` is what is left of the
   * repair's purse, always above zero: the recovery's total, which its ledger
   * holds every call to.
   */
  annotate(request: RepairRequest, costLeftUsd: number): Promise<AutomationStudioFlowRunDetail>;
  /**
   * The build, run-owned, with the brief beside the Flow's own instructions.
   * `costLeftUsd` is what is left of the repair's purse, always above zero: the
   * build's total, which its loop budget holds it to.
   */
  generate(request: AutomationStudioGenerateFlowBootstrapAdaptationInput, brief: AutomationStudioFlowInstruction, costLeftUsd: number): Promise<AutomationStudioGenerateFlowBootstrapAdaptationResult>;
  approve(input: { projectId: string; flowId: string; adaptationId: string; actorId: string }): Promise<unknown>;
  /** Applies the approved adaptation; the run then replays the Flow it produced. */
  apply(input: { projectId: string; flowId: string; adaptationId: string; actorId: string }): Promise<unknown>;
  now?: () => number;
};

/** The actor every re-author is reviewed and applied as. */
const REPAIR_ACTOR = "runtime.result_repair";

type Built = Awaited<ReturnType<typeof automationStudioReauthorRefutedResult>>;

/**
 * A build the purse had nothing left for. It was never started, so no request
 * went out, and another attempt would meet the same empty purse.
 */
const COST_BOUND_FAILURE: AutomationStudioRefutedResultFailure = Object.freeze({
  code: AUTOMATION_STUDIO_RESULT_REPAIR_COST_BOUND_CODE,
  retryable: false,
  providerInvocation: "not_attempted",
  providerResponse: "not_received"
});

/** The port the verification calls for a refuted run. */
export function automationStudioRefutedResultRepairPort(deps: AutomationStudioRefutedResultRepairPortDependencies): AutomationStudioRefutedResultRepairPort {
  const now = deps.now ?? Date.now;
  return async (refuted) => {
    const flowId = deps.flowId();
    // Opened where an earlier pass of this run's repair left it, so a re-run
    // refuted again spends from the same total rather than a fresh one.
    let purse = automationStudioResultRepairPurse(refuted.detail, deps.maxCostUsd?.());
    const decision = automationStudioRefutedResultReauthorDecision({ detail: refuted.detail, ...(deps.projectId ? { projectId: deps.projectId } : {}), ...(flowId ? { flowId } : {}) });
    if (!decision.route) {
      const laddered = await patchLadder(deps, refuted, refuted.detail, purse);
      return automationStudioResultRepairWithPurse(automationStudioRefutedResultReauthored({ detail: laddered.detail, decision, attempt: refuted.current.attempt }), laddered.purse);
    }
    const brief = automationStudioReauthorBrief({ projectId: decision.projectId, flowId: decision.flowId, current: refuted.current, history: refuted.history, maxAttempts: refuted.maxAttempts, now: now() });
    const build = async (): Promise<Built> => {
      if (!automationStudioResultRepairPurseAllowsPart(purse)) {
        purse = automationStudioResultRepairPurseRefused(purse, "reauthor");
        return { failure: COST_BOUND_FAILURE, durationMs: 0 };
      }
      const costLeftUsd = automationStudioResultRepairPurseLeftUsd(purse);
      const built = await automationStudioReauthorRefutedResult({
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
          }, brief, costLeftUsd);
          return { adaptationId: generated.adaptationId, accounting: { ...generated.accounting } };
        },
        approve: (adaptationId) => deps.approve({ projectId: decision.projectId, flowId: decision.flowId, adaptationId, actorId: REPAIR_ACTOR }),
        apply: (adaptationId) => deps.apply({ projectId: decision.projectId, flowId: decision.flowId, adaptationId, actorId: REPAIR_ACTOR }),
        failureCode: (error) => automationStudioRefutedResultFailureOf(automationStudioFlowBootstrapFailureDiagnosticOf(error, "pre_provider_validation"))
      });
      // A build that made an edit called the model; a failed one says whether
      // its request went out, and its loop how many decisions it made. Either
      // is charged what it reported.
      purse = automationStudioResultRepairPurseCharged(purse, {
        costUsd: (built.accounting ?? built.failure?.accounting)?.estimatedCostUsd,
        calls: built.failure?.evidenceLoop?.decisionCount,
        reachedProvider: built.adaptationId !== undefined || (built.failure?.providerInvocation !== undefined && built.failure.providerInvocation !== "not_attempted")
      });
      return built;
    };
    const record = (detail: AutomationStudioFlowRunDetail, built: Built) => automationStudioRefutedResultReauthored({
      detail,
      decision,
      ...built,
      attempt: refuted.current.attempt,
      brief: briefRecord(refuted, brief)
    });
    let built = await build();
    let repaired = record(refuted.detail, built);
    // A build that failed for a reason that may pass is built again once, and
    // both builds are on the run. The second is handed only what the first left.
    if (!built.adaptationId && built.failure?.retryable === true) {
      built = await build();
      repaired = record(repaired, built);
    }
    // A build that produced no edit at all degrades to the smaller repair --
    // the patch ladder a refutation the route does not take is given -- rather
    // than ending the repair with nothing tried (`run-mulxk0ro-36bf090d`).
    if (!built.adaptationId && built.failure) {
      const degraded = await degradeToPatchLadder(deps, refuted, repaired, built.failure.code, purse);
      return automationStudioResultRepairWithPurse(degraded.detail, degraded.purse);
    }
    return automationStudioResultRepairWithPurse(repaired, purse);
  };
}

/**
 * The patch ladder, handed what is left of the purse and charged what its
 * recovery reported, or not run at all when nothing is left.
 */
async function patchLadder(
  deps: AutomationStudioRefutedResultRepairPortDependencies,
  refuted: RepairRequest,
  detail: AutomationStudioFlowRunDetail,
  purse: AutomationStudioResultRepairPurse
): Promise<{ detail: AutomationStudioFlowRunDetail; purse: AutomationStudioResultRepairPurse; ran: boolean }> {
  if (!automationStudioResultRepairPurseAllowsPart(purse)) return { detail, purse: automationStudioResultRepairPurseRefused(purse, "patch_ladder"), ran: false };
  const annotated = await deps.annotate({ ...refuted, detail }, automationStudioResultRepairPurseLeftUsd(purse));
  return { detail: annotated, purse: automationStudioResultRepairPurseCharged(purse, recoverySpend(detail, annotated)), ran: true };
}

/**
 * What the recovery reported spending, read off the gate record it wrote.
 *
 * A recovery that returned before writing one -- a run it did not take up --
 * leaves the record it was handed in place, and that record is an earlier
 * step's (the result check writes one), so it is read only where this
 * recovery replaced it.
 */
function recoverySpend(before: AutomationStudioFlowRunDetail, after: AutomationStudioFlowRunDetail): { costUsd?: unknown; calls?: unknown; reachedProvider: boolean } {
  const gate = after.metadata?.llmGate;
  if (!gate || gate === before.metadata?.llmGate || typeof gate !== "object" || Array.isArray(gate)) return { reachedProvider: false };
  const record = gate as JsonObject;
  const accounting = record.costAccounting;
  const counted = accounting && typeof accounting === "object" && !Array.isArray(accounting) ? accounting as JsonObject : undefined;
  return { costUsd: counted?.estimatedCostUsd, calls: counted?.calls, reachedProvider: record.invoked === true };
}

/**
 * The run after the re-author built nothing: annotated by the patch ladder,
 * with the degradation recorded on the re-author marker. A ladder that throws
 * in turn leaves the re-author's record standing and says that too, so the
 * repair still ends having said what it tried. A ladder the purse had nothing
 * left for is not run, and the degradation names the cost bound.
 */
async function degradeToPatchLadder(
  deps: AutomationStudioRefutedResultRepairPortDependencies,
  refuted: RepairRequest,
  repaired: AutomationStudioFlowRunDetail,
  afterCode: string,
  purse: AutomationStudioResultRepairPurse
): Promise<{ detail: AutomationStudioFlowRunDetail; purse: AutomationStudioResultRepairPurse }> {
  try {
    const laddered = await patchLadder(deps, refuted, repaired, purse);
    return { detail: automationStudioRefutedResultDegraded(laddered.detail, { to: "patch_ladder", afterCode, ...(laddered.ran ? {} : { bound: "cost" as const }) }), purse: laddered.purse };
  } catch {
    return { detail: automationStudioRefutedResultDegraded(repaired, { to: "patch_ladder", afterCode, failed: true }), purse };
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
