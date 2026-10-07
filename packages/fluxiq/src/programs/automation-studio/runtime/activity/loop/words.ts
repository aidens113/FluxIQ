import { emitAutomationStudioActivityLoopEnded } from "./ended.ts";
import { automationStudioActivityLoops } from "./loops.ts";
import { automationStudioActivityLoopPass } from "./pass.ts";
import type { AutomationStudioActivityLoopPass } from "./types.ts";

type Flow = Parameters<typeof automationStudioActivityLoops>[0];
type Attempt = Parameters<typeof emitAutomationStudioActivityLoopEnded>[0]["attempt"];

/**
 * A run's do-while loops, read once from the Flow, as the executor's two
 * activity call sites need them: `passOf` the pass a step about to start runs
 * as (for its card), and `settled` to say a loop's end once the attempt that
 * ended it is recorded. Both read the run's attempts, so a resumed run, whose
 * attempts carry the passes it made before it parked, goes on counting.
 */
export function automationStudioActivityLoopWords(flow: Flow): {
  passOf: (nodeId: string, attempts: readonly Attempt[]) => AutomationStudioActivityLoopPass | undefined;
  settled: (attempt: Attempt, attempts: readonly Attempt[]) => void;
} {
  const loops = automationStudioActivityLoops(flow);
  return {
    passOf: (nodeId, attempts) => loops.length ? automationStudioActivityLoopPass(loops, attempts, nodeId) : undefined,
    settled: (attempt, attempts) => { if (loops.length) emitAutomationStudioActivityLoopEnded({ loops, edges: flow.edges, attempts, attempt }); }
  };
}
