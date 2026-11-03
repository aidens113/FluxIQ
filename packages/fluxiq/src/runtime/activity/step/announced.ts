/**
 * The heads of the Flow's loops (`nodes/control-flow/for-each.ts`,
 * `repeat.ts`, `loop.ts`): control steps a run comes back to after each pass,
 * and once more to leave the loop.
 */
const LOOP_HEAD_DEFINITION_IDS: ReadonlySet<string> = new Set(["builtin.control.for-each", "builtin.control.repeat", "builtin.control.loop"]);

/**
 * Whether the run says "Running step N of M" (`./started.ts`) as it reaches
 * `node`, given the `attempts` it made before. A loop's head is said once, the
 * first time the run reaches it. Coming back to it after a pass, or to leave
 * the loop, does nothing a person could see, and saying it again put its lower
 * number after the loop's last step: "Step 8 of 8" then "Step 6 of 8" while the
 * result was checked (round 12, lane D, `run-mv62icw0-070f88ad`). Every other
 * step is said each time it runs: its retry, or the next pass of a loop, is a
 * step a person sees.
 */
export function automationStudioActivityStepAnnounced(node: { id: string; definitionId: string }, attempts: readonly { nodeId: string }[]): boolean {
  if (!LOOP_HEAD_DEFINITION_IDS.has(node.definitionId)) return true;
  return !attempts.some((attempt) => attempt.nodeId === node.id);
}
