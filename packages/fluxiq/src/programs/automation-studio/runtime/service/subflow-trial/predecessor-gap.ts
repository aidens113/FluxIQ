// Whether a phase that begins after predecessors can run their latest passing
// proposals to reach its entry (t580, t590, t593). A partial trial asks it
// before it runs (`./run.ts`), and so does every project phase that starts on
// that entry (`../project-build/phase-start.ts`): the same answer for both, so
// a builder never explores from an entry its own trial then could not reach.
//
// - **Missing**: a predecessor the scope names has no proposal here, or they are
//   not in the scope's order.
// - **Stale**: one was made under another build, or under another plan the plan
//   in force did not keep (`keptUnder`: an amendment that left that subflow as
//   it was keeps its proposal, `project-agents/supervisor/state.ts`).

import type { AutomationStudioSubflowProposal, AutomationStudioSubflowScope } from "../../flow-bootstrap/subflow-candidate/index.ts";

/** Why the predecessors cannot run, by subflow key; undefined when they can. */
export type AutomationStudioSubflowTrialPredecessorGap = { missing: string[] } | { stale: string[] };

/** The gap between `scope`'s predecessors and the proposals there are for them (header). */
export function automationStudioSubflowTrialPredecessorGap(
  scope: Pick<AutomationStudioSubflowScope, "buildId" | "planDigest" | "predecessors">,
  predecessors: readonly AutomationStudioSubflowProposal[],
  keptUnder?: ((subflowKey: string, madeUnder: string, planDigest: string) => boolean) | undefined
): AutomationStudioSubflowTrialPredecessorGap | undefined {
  const keys = predecessors.map((predecessor) => predecessor.scope.subflowKey);
  if (keys.length !== scope.predecessors.length || keys.some((key, index) => key !== scope.predecessors[index])) {
    return { missing: scope.predecessors.filter((key) => !keys.includes(key)) };
  }
  const current = (predecessor: AutomationStudioSubflowProposal) => predecessor.scope.planDigest === scope.planDigest || keptUnder?.(predecessor.scope.subflowKey, predecessor.scope.planDigest, scope.planDigest) === true;
  const stale = predecessors.filter((predecessor) => predecessor.scope.buildId !== scope.buildId || !current(predecessor)).map((predecessor) => predecessor.scope.subflowKey);
  return stale.length ? { stale } : undefined;
}
