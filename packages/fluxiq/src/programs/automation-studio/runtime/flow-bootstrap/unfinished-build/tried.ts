// What a build that could not finish says it tried, as ids and counts beside
// its message: one record for every ending (`./not-doable.ts`,
// `./budget-exhausted.ts`, `./replies-unreadable.ts`,
// `./provider-unavailable.ts`), so they cannot come to disagree about it.
//
// **Why each round stopped is kept (live run muqk713g, Stage 6).** The rounds'
// stops lived only in the loop's locals (`./phases.ts`), and the no-route case
// only in the not-doable sentence, so a debug could not tell which bound ended
// which round. They are recorded here as closed words, which the run record
// and the Lab publish as they are.
import type { AutomationStudioFlowBootstrapBuildEnding } from "../generation-failure/index.ts";
import type { AutomationStudioFlowBootstrapJudgement, AutomationStudioFlowBootstrapNoRouteLeft } from "./contracts.ts";

/** The ending's `tried`: live rounds, decisions, the Flow's steps, the last test, each round's stop and, for "not doable", which case left no route. */
export function automationStudioFlowBootstrapTried(input: {
  rounds: number;
  decisions: number;
  judgement: AutomationStudioFlowBootstrapJudgement;
  stops?: AutomationStudioFlowBootstrapBuildEnding["tried"]["stops"] | undefined;
  noRoute?: AutomationStudioFlowBootstrapNoRouteLeft | undefined;
}): AutomationStudioFlowBootstrapBuildEnding["tried"] {
  return {
    rounds: input.rounds,
    decisions: input.decisions,
    stepsInFlow: input.judgement.stepsInFlow,
    tested: input.judgement.tested,
    ...(input.stops?.length ? { stops: input.stops.map(({ round, stopped }) => ({ round, stopped })) } : {}),
    ...(input.noRoute ? { noRoute: { kind: input.noRoute.kind } } : {})
  };
}
