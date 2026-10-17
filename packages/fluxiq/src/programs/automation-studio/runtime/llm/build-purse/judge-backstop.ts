// A judge paid by a brief's allowance first, and by the purse it was carved
// from when the allowance cannot pay (t685).
//
// **Why.** On a single-subflow plan every builder test is the build's judged
// whole run (`../../project-agents/single-subflow/single-subflow-trial.ts`).
// Its judge used to run under the build's purse alone, where an open
// allowance's money is kept from every other call, so it could draw only on the
// judging reserve: four calls, a judged run and one repair round. Lab run
// `run-mvblai1v-a31e7593` spent that reserve on two tests, and the third was
// refused `candidate.trial_unaffordable` ($0.0086 left against $0.0109 needed)
// while the build had spent about $0.02 of $0.25 and the brief's allowance,
// sized near the whole purse, was almost untouched.
//
// So such a test runs inside a scope of the brief's allowance that names the
// purse it was carved from as the judge's backstop. Each judge call made inside
// it is held as any call under the allowance is -- against the allowance, its
// top-ups from what the purse can carve (`./top-up.ts`), and every purse above
// -- and only when that is refused is it held against the backstop on its own,
// where it draws on the judging reserve as before (`./purse.ts`, `hold`). A
// call that is not a judge's is held as under any scope of the allowance. The
// reserve is the backstop, not the payer, so it is still there for the judged
// whole run and one repair round after the brief.
//
// The backstop must be a purse `purse` was carved from: the call is then held
// against the same Flow ceiling whichever pays, and nothing is counted twice.

import type { AutomationStudioLlmBuildPurse } from "./purse.ts";
import { automationStudioLlmBuildPurseInFrame } from "./run-frame.ts";

/**
 * Make every call inside `call` under `purse`, as `automationStudioLlmBuildPurseScope`
 * does, with `backstop` paying each judge call `purse` cannot (header). Throws
 * when `backstop` is not a purse `purse` was carved from.
 */
export async function automationStudioLlmBuildPurseJudgeBackstopScope<T>(purse: AutomationStudioLlmBuildPurse, backstop: AutomationStudioLlmBuildPurse, call: () => Promise<T>): Promise<T> {
  let above = purse.parent;
  while (above && above !== backstop) above = above.parent;
  if (!above) throw new Error("A judge's backstop must be a purse the allowance was carved from.");
  return await automationStudioLlmBuildPurseInFrame(purse, false, call, backstop);
}
