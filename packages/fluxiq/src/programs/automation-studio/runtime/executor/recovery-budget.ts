import type { AutomationStudioFlowDocument } from "../../model/index.ts";
import { AUTOMATION_STUDIO_LADDER_RUNG_KINDS, type AutomationStudioNodeAttemptTrace, type AutomationStudioRecoveryBudget } from "./contracts.ts";
import { automationStudioOptionalStepWayOn } from "./step-skip/index.ts";

/** The rungs by which a node repeats itself: the per-node attempt allowance bounds them, not the recovery budgets. */
const LADDER_RUNG_KINDS: ReadonlySet<string> = new Set(AUTOMATION_STUDIO_LADDER_RUNG_KINDS);

export function recoveryBudgetState(attempts: AutomationStudioNodeAttemptTrace[], currentAttemptIndex: number, nodeId: string, currentSubflowId: string | undefined, flow: AutomationStudioFlowDocument): { failedAttemptsForAction: number; recoveryAttemptsForSubflow: number; reroutesForRun: number; llmAttemptsForRun: number } {
  const previous = attempts.filter((_, index) => index !== currentAttemptIndex);
  // Going on past an optional step is the Flow's own path, not a recovery
  // (`step-skip/optional-step.ts`). Counted here, a Flow's third optional step
  // that timed out or could not be pressed found the default subflow budget of
  // two spent by the first two and stopped the playback its trial had passed
  // (t368's report, t371).
  const optionalWayOns = new Map<string, string | undefined>();
  const wentOnPastOptional = (attempt: AutomationStudioNodeAttemptTrace): boolean => {
    const selected = attempt.recoveryDecision?.selected;
    if (selected?.kind !== "deterministic_path" || selected.edgeId === undefined) return false;
    if (!optionalWayOns.has(attempt.nodeId)) {
      const node = flow.nodes.find((candidate) => candidate.id === attempt.nodeId);
      optionalWayOns.set(attempt.nodeId, node ? automationStudioOptionalStepWayOn(flow, node)?.id : undefined);
    }
    return optionalWayOns.get(attempt.nodeId) === selected.edgeId;
  };
  // A decision that sent the node round again -- a retry, a wait, a cleared
  // dialog -- is the node's own attempt loop, bounded by its attempt allowance.
  // Counted here, two retries of one press spent the default subflow budget of
  // two, and the press's third failure lost the Flow's own authored failed
  // route: an optional press whose target was absent stopped the run instead of
  // going on down `failed` (live run `run-munv53gt-a0e6f545`).
  const previousRecovery = previous.filter((attempt) => attempt.recoveryDecision && !LADDER_RUNG_KINDS.has(attempt.recoveryDecision.selected?.kind ?? "") && !wentOnPastOptional(attempt));
  return {
    // An attempt the ladder retried is not a fresh arrival at the action. The
    // retry loop bounds itself through `maxRetriesPerAction`, and counting its
    // own attempts here as well would spend the reroute and subflow budgets on
    // one node retrying itself.
    failedAttemptsForAction: previous.filter((attempt) => attempt.nodeId === nodeId && attempt.status === "failed" && !attempt.retry).length,
    recoveryAttemptsForSubflow: previousRecovery.filter((attempt) => !currentSubflowId || attempt.recoveryDecision?.lookup.currentSubflowId === currentSubflowId).length,
    reroutesForRun: previousRecovery.filter((attempt) => {
      const kind = attempt.recoveryDecision?.selected?.kind;
      return kind === "deterministic_path" || kind === "reroute";
    }).length,
    llmAttemptsForRun: previousRecovery.filter((attempt) => attempt.recoveryDecision?.selected?.kind === "llm_diagnosis").length
  };
}

/**
 * Which budgets this failure has already spent.
 *
 * `maxRetriesPerAction` is not among them any more. It used to be read here,
 * where its only effect was to withdraw the Flow's **own authored failed
 * route** as soon as a node had failed once before -- a cap wearing the name of
 * an allowance, and one that removed a Flow's deliberate error handling rather
 * than bounding anything the runtime did. It is now what it says it is: the
 * attempt allowance the per-node retry loop runs under
 * (`automationStudioNodeRetryPolicy`).
 */
export function recoveryBudgetExhaustion(budget: AutomationStudioRecoveryBudget, state: { failedAttemptsForAction: number; recoveryAttemptsForSubflow: number; reroutesForRun: number; llmAttemptsForRun: number }): { recovery: boolean; reroute: boolean; llm: boolean; message?: string } {
  const recovery = budget.maxRecoveryAttemptsPerSubflow !== undefined && state.recoveryAttemptsForSubflow >= budget.maxRecoveryAttemptsPerSubflow;
  const reroute = budget.maxReroutesPerRun !== undefined && state.reroutesForRun >= budget.maxReroutesPerRun;
  const llm = budget.maxAdaptationOrLlmAttemptsPerRun !== undefined && state.llmAttemptsForRun >= budget.maxAdaptationOrLlmAttemptsPerRun;
  const exhausted = [
    recovery ? "max recovery attempts per subflow" : "",
    reroute ? "max reroutes per run" : "",
    llm ? "max adaptation/LLM attempts per run" : ""
  ].filter(Boolean);
  return {
    recovery,
    reroute,
    llm,
    ...(exhausted.length ? { message: `Recovery budget exhausted: ${exhausted.join(", ")}.` } : {})
  };
}
