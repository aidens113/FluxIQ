// The call steps by which a finished run reached one version: which step of which frame
// called what, from the run's first frame down. A move of a pin is about the steps that ran
// it, read off the run itself, and no others.

import type { AutomationStudioNodeAttemptTrace } from "../index.ts";

/** One call a run made: the frame that made it (`null` for the run's first frame), the step, and the Subflow id it ran. */
export type AutomationStudioPartCallStep = { frame: string | null; nodeId: string; target: string };

/** Each distinct path of calls whose last step finished `subflowId`. */
export function automationStudioPartCallPaths(attempts: readonly AutomationStudioNodeAttemptTrace[], subflowId: string): AutomationStudioPartCallStep[][] {
  const paths = new Map<string, AutomationStudioPartCallStep[]>();
  const visit = (visited: readonly AutomationStudioNodeAttemptTrace[], frame: string | null, path: readonly AutomationStudioPartCallStep[]): void => {
    for (const attempt of visited) {
      const target = attempt.subflowTarget?.subflowId;
      if (!target) continue;
      const here = [...path, { frame, nodeId: attempt.nodeId, target }];
      if (target === subflowId && attempt.status === "succeeded") paths.set(JSON.stringify(here), here);
      visit(attempt.childTrace?.attempts ?? [], target, here);
    }
  };
  visit(attempts, null, []);
  return [...paths.values()];
}
