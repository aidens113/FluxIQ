import { emitAutomationStudioActivityLoopEnded } from "./ended.ts";
import { automationStudioActivityLoops } from "./loops.ts";
import { automationStudioActivityLoopPass } from "./pass.ts";
import { automationStudioActivityLoopRow } from "./row.ts";
import type { AutomationStudioActivityLoopPass } from "./types.ts";

type Flow = Parameters<typeof automationStudioActivityLoops>[0];

/** A list loop's head (`nodes/control-flow/for-each.ts`), by whole id. */
const FOR_EACH_DEFINITION_ID = "builtin.control.for-each";
type Attempt = Parameters<typeof emitAutomationStudioActivityLoopEnded>[0]["attempt"];

/**
 * A run's do-while loops, read once from the Flow, as the executor's two
 * activity call sites need them: `passOf` the pass a step about to start runs
 * as (for its card), and `settled` to say a loop's end once the attempt that
 * ended it is recorded. Both read the run's attempts, so a resumed run, whose
 * attempts carry the passes it made before it parked, goes on counting.
 *
 * A step a list loop's pass runs (`repeat over`) also carries the row that
 * pass is on (`./row.ts`, t378): beside a do-while pass when it is in both,
 * else as a `row` pass of its own, which adds no words to the step's sentence.
 */
export function automationStudioActivityLoopWords(flow: Flow): {
  passOf: (nodeId: string, attempts: readonly Attempt[]) => AutomationStudioActivityLoopPass | undefined;
  settled: (attempt: Attempt, attempts: readonly Attempt[]) => void;
} {
  const loops = automationStudioActivityLoops(flow);
  const lists = automationStudioActivityLoops(flow, FOR_EACH_DEFINITION_ID);
  return {
    passOf: (nodeId, attempts) => {
      const pass = loops.length ? automationStudioActivityLoopPass(loops, attempts, nodeId) : undefined;
      const row = lists.length ? automationStudioActivityLoopRow(lists, attempts, nodeId) : undefined;
      return pass && row ? { ...pass, row: row.row } : pass ?? row;
    },
    settled: (attempt, attempts) => { if (loops.length) emitAutomationStudioActivityLoopEnded({ loops, edges: flow.edges, attempts, attempt }); }
  };
}
