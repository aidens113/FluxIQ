// One re-author build, held to the repair's purse: build, approve, apply, and
// once more only after a named transient provider request failure.
//
// Two routes re-author a Flow from the run: a result the check refuted
// (`refuted-result-port.ts`) and a step the patch ladder could not repair
// (`step-failure-port.ts`). They differ in what the build is told and in what
// happens when it builds nothing; the build itself -- whose key pays, what the
// purse hands it, how a failure is read, when it is tried again, and how each
// attempt is charged -- is the same, and is written once here so the two cannot
// come to disagree about it.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowInstruction, AutomationStudioFlowRunDetail } from "../../../model/index.ts";
import { automationStudioFlowBootstrapFailureDiagnosticOf, flowBootstrapPhaseFailure, type AutomationStudioFlowBootstrapFailureDiagnostic } from "../../flow-bootstrap/generation-failure/index.ts";
import type { AutomationStudioActionConsequence } from "../../action-permissions/index.ts";
import { automationStudioRunNodeStartPages, type AutomationStudioLlmModelCaller } from "../../llm/index.ts";
import {
  AUTOMATION_STUDIO_RESULT_REPAIR_COST_BOUND_CODE,
  automationStudioReauthorRefutedResult,
  automationStudioResultRepairPurseAllowsPart,
  automationStudioResultRepairPurseCharged,
  automationStudioResultRepairPurseLeftUsd,
  automationStudioResultRepairPurseRefused,
  type AutomationStudioRefutedResultFailure,
  type AutomationStudioResultRepairPurse
} from "../../recovery/refuted-result/index.ts";
import type { AutomationStudioGenerateFlowBootstrapAdaptationInput, AutomationStudioGenerateFlowBootstrapAdaptationResult } from "../flow-bootstrap-commands/index.ts";

/** What a re-author build borrows from the service: the run's caller, and the build and its review. */
export type AutomationStudioReauthorBuildDependencies = {
  /** The person the run was made for, whose key the build pays with too. Absent for a run nobody asked the model into. */
  caller?: AutomationStudioLlmModelCaller | undefined;
  /** The lasting consequences the run's caller already allowed, carried into the build. */
  permittedConsequences?: readonly AutomationStudioActionConsequence[] | undefined;
  /**
   * The build, run-owned, with the brief beside the Flow's own instructions.
   * `costLeftUsd` is what is left of the repair's purse, always above zero: the
   * build's total, which its loop budget holds it to.
   *
   * `startPages` is where each node's first attempt started in the run being
   * repaired, by node id, as the host stated it (`llm/node-tools/run-start-pages.ts`):
   * a rerun of a step carried from the Flow is put back there before it runs,
   * not run wherever the run left the target (t194 cause C-D, `run-murwcmx2`).
   * Empty when the run's host recorded none.
   */
  generate(request: AutomationStudioGenerateFlowBootstrapAdaptationInput, brief: AutomationStudioFlowInstruction, costLeftUsd: number, startPages: Readonly<Record<string, JsonObject>>): Promise<AutomationStudioGenerateFlowBootstrapAdaptationResult>;
  approve(input: { projectId: string; flowId: string; adaptationId: string; actorId: string }): Promise<unknown>;
  /** Applies the approved adaptation; the run then replays the Flow it produced. */
  apply(input: { projectId: string; flowId: string; adaptationId: string; actorId: string }): Promise<unknown>;
};

/** What one build answered: its adaptation and whether it applied, or the failure it ended under. */
export type AutomationStudioReauthorBuilt = Awaited<ReturnType<typeof automationStudioReauthorRefutedResult>>;

/** The actor every re-author is reviewed and applied as. */
const REPAIR_ACTOR = "runtime.result_repair";

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

/**
 * Builds the extend-mode edit from `brief`, approves and applies it, and
 * records each attempt on the run through `record`. A build that failed for a
 * transient provider request reason is built again once, handed only what the first left.
 * A build the purse has nothing left for is not started: it asks no model and
 * is recorded under the cost bound.
 */
export async function automationStudioReauthorBuild(input: {
  deps: AutomationStudioReauthorBuildDependencies;
  projectId: string;
  flowId: string;
  brief: AutomationStudioFlowInstruction;
  purse: AutomationStudioResultRepairPurse;
  detail: AutomationStudioFlowRunDetail;
  /** The run, carrying this attempt. */
  record(detail: AutomationStudioFlowRunDetail, built: AutomationStudioReauthorBuilt): AutomationStudioFlowRunDetail;
  now: () => number;
}): Promise<{ detail: AutomationStudioFlowRunDetail; built: AutomationStudioReauthorBuilt; purse: AutomationStudioResultRepairPurse }> {
  const { deps, projectId, flowId, brief, now } = input;
  // Read once, off the run as it was refuted: a retry of the build starts from the same run.
  const startPages = automationStudioRunNodeStartPages(input.detail);
  let purse = input.purse;
  const build = async (): Promise<AutomationStudioReauthorBuilt> => {
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
          projectId, flowId, mode: "extend", evidenceGuided: true,
          caller: { actorUserId: caller.actorUserId, actorSessionId: caller.actorSessionId },
          ...(deps.permittedConsequences?.length ? { permittedConsequences: [...deps.permittedConsequences] } : {})
        }, brief, costLeftUsd, startPages);
        return { adaptationId: generated.adaptationId, accounting: { ...generated.accounting } };
      },
      approve: (adaptationId) => deps.approve({ projectId, flowId, adaptationId, actorId: REPAIR_ACTOR }),
      apply: (adaptationId) => deps.apply({ projectId, flowId, adaptationId, actorId: REPAIR_ACTOR }),
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
  let built = await build();
  let detail = input.record(input.detail, built);
  // Public retryability also covers continuing a kept draft after an unfinished
  // or budget ending. Only a named transient request failure merits immediately
  // rebuilding the unchanged brief. Both attempts remain on the same purse.
  if (!built.adaptationId && automaticRequestRetry(built.failure)) {
    built = await build();
    detail = input.record(detail, built);
  }
  return { detail, built, purse };
}

function automaticRequestRetry(failure: AutomationStudioRefutedResultFailure | undefined): boolean {
  if (failure?.retryable !== true || failure.stage !== "provider_request") return false;
  switch (failure.code) {
    case "flow_bootstrap.provider_timeout":
      // An explicit timeout has canonical unknown/attempted invocation authority;
      // unknown transport without that typed cause never enters this branch.
      return (failure.providerInvocation === "unknown" || failure.providerInvocation === "attempted")
        && failure.providerResponse === "not_received";
    case "flow_bootstrap.provider_network_error":
      return failure.providerInvocation === "attempted" && failure.providerResponse === "unknown";
    case "flow_bootstrap.provider_rate_limited":
      return failure.providerInvocation === "attempted" && failure.providerResponse === "received";
    case "flow_bootstrap.provider_http_error":
      return failure.providerInvocation === "attempted" && failure.providerResponse === "received"
        && typeof failure.providerStatus === "number" && Number.isInteger(failure.providerStatus)
        && failure.providerStatus >= 500 && failure.providerStatus <= 599;
    default:
      return false;
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
    ...(diagnostic.evidenceLoop ? { evidenceLoop: JSON.parse(JSON.stringify(diagnostic.evidenceLoop)) as JsonObject } : {}),
    ...(diagnostic.ending ? { ending: closedEnding(diagnostic.ending) } : {})
  };
}

/**
 * A build's ending without its words: the message is Core's sentences around
 * the person's own words for what they asked, and each act's quote is those
 * words, so neither is written to the run. What is kept is closed -- the kind,
 * the budget, act ids and codes, counts, and each round's stop and the
 * no-route case -- which is what says why each round stopped (live run
 * muqk713g).
 */
function closedEnding(ending: NonNullable<AutomationStudioFlowBootstrapFailureDiagnostic["ending"]>): JsonObject {
  const { tried } = ending;
  return {
    kind: ending.kind,
    ...(ending.bound ? { bound: ending.bound } : {}),
    notDone: ending.notDone.map(({ id, todo }) => ({ id, todo })),
    tried: {
      rounds: tried.rounds,
      decisions: tried.decisions,
      stepsInFlow: tried.stepsInFlow,
      tested: tried.tested,
      ...(tried.stops ? { stops: tried.stops.map(({ round, stopped }) => ({ round, stopped })) } : {}),
      ...(tried.noRoute ? { noRoute: { kind: tried.noRoute.kind } } : {})
    }
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
