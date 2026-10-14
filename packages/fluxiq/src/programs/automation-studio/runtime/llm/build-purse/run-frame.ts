// Where a purse's refusal is kept: on the run that met it, not on the purse.
//
// **Why not one field (t534).** A purse used to keep the last call it refused
// in one field, and `./run.ts` cleared that field as each run began. One build
// made its calls one at a time, so the field was always the current run's. Two
// runs on one purse at once -- builders spending a shared build purse, the
// project supervisor judging while a builder explores -- would clear and
// overwrite each other's: a refused run could read a sibling's cleared field
// and report success, or end on a refusal it never met.
//
// So every scope or run a purse is entered with opens a frame carried with the
// async work, and a purse's `refusal` reads and writes the frames of that purse
// on the current async chain (`./purse.ts`). A write reaches the innermost frame
// of the purse and every enclosing one of the same purse, plus the purse's own
// last refusal for readers outside any frame. A run's frame starts cleared, a
// scope's inherits what was there. Along one chain that is exactly the old
// single field; two chains that diverge share only the frames above where they
// split, and a run reads its own.

import { AsyncLocalStorage } from "node:async_hooks";
import type { AutomationStudioLlmBuildPurse, AutomationStudioLlmBuildPurseRefusal } from "./purse.ts";

/** One scope or run a purse was entered with, and the refusal met inside it. */
export type AutomationStudioLlmBuildPurseFrame = {
  readonly purse: AutomationStudioLlmBuildPurse;
  refusal: AutomationStudioLlmBuildPurseRefusal | undefined;
  readonly parent: AutomationStudioLlmBuildPurseFrame | undefined;
};

const frames = new AsyncLocalStorage<AutomationStudioLlmBuildPurseFrame>();

/** The innermost frame on the current async chain, of any purse. */
export function automationStudioLlmBuildPurseCurrentFrame(): AutomationStudioLlmBuildPurseFrame | undefined {
  return frames.getStore();
}

/** Every frame of `purse` on the current async chain, innermost first. */
export function automationStudioLlmBuildPurseFramesOf(purse: AutomationStudioLlmBuildPurse): AutomationStudioLlmBuildPurseFrame[] {
  const found: AutomationStudioLlmBuildPurseFrame[] = [];
  for (let frame = frames.getStore(); frame; frame = frame.parent) {
    if (frame.purse === purse) found.push(frame);
  }
  return found;
}

/**
 * Run `call` in a new frame of `purse`. `cleared` starts it with no refusal and
 * clears the enclosing frames of the purse with it, as a run's start always
 * did; otherwise it starts with the refusal already visible here.
 */
export async function automationStudioLlmBuildPurseInFrame<T>(purse: AutomationStudioLlmBuildPurse, cleared: boolean, call: () => Promise<T>): Promise<T> {
  const frame: AutomationStudioLlmBuildPurseFrame = { purse, refusal: cleared ? undefined : purse.refusal, parent: frames.getStore() };
  return await frames.run(frame, async () => {
    if (cleared) purse.refusal = undefined;
    return await call();
  });
}
