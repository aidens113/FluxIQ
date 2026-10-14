// The purse a call is made under, carried with the async work rather than
// threaded through every caller.
//
// The loop owns the purse and the harness is the only place that sees the
// request about to be sent, with the build's own decide callback in between
// (`runtime/service.ts`), which knows nothing about money and should not have
// to. So the loop runs each decision inside the purse's context and the harness
// reads it from there (`./harness-hold.ts`), as the activity frame reaches an
// emission site deep in the executor (`../../activity/storage.ts`). A call made
// outside any purse -- a recovery, a judge, a one-shot build -- sees none and is
// bounded as before.
//
// Each scope and run opens a frame of its own (`./run-frame.ts`), so two runs
// on one purse at once each read the refusal they met (t534).

import type { AutomationStudioLlmBuildPurse } from "./purse.ts";
import { AutomationStudioLlmBuildPurseRefused } from "./refused.ts";
import { automationStudioLlmBuildPurseCurrentFrame, automationStudioLlmBuildPurseInFrame } from "./run-frame.ts";

/** The purse the current call is made under, if any: an allowance, when a builder's call is made under one. */
export function automationStudioLlmCurrentBuildPurse(): AutomationStudioLlmBuildPurse | undefined {
  return automationStudioLlmBuildPurseCurrentFrame()?.purse;
}

/**
 * Make every call inside `call` under `purse`, as `call` itself reads the
 * outcome: a refused call fails as the harness reports it and nothing is
 * thrown for it here. The build's whole body runs inside this, so the calls no
 * loop wraps -- the instruction reading, the test, the judge -- are held against
 * the same purse as the decisions (`./purse.ts`). A loop that wraps its own
 * decisions in `automationStudioLlmBuildPurseRun` with the same purse nests
 * inside it.
 */
export async function automationStudioLlmBuildPurseScope<T>(purse: AutomationStudioLlmBuildPurse | undefined, call: () => Promise<T>): Promise<T> {
  if (!purse) return await call();
  return await automationStudioLlmBuildPurseInFrame(purse, false, call);
}

/**
 * Run `call` under `purse`. If the purse refused a call `call` made, throws
 * `AutomationStudioLlmBuildPurseRefused` whatever `call` itself returned or
 * threw: the refusal is the ending, and a caller's reading of the failed
 * result is not. Without a purse, runs `call` as it is.
 *
 * The refusal read is this run's own, never a concurrent run's on the same
 * purse (`./run-frame.ts`).
 */
export async function automationStudioLlmBuildPurseRun<T>(purse: AutomationStudioLlmBuildPurse | undefined, call: () => Promise<T>): Promise<T> {
  if (!purse) return await call();
  return await automationStudioLlmBuildPurseInFrame(purse, true, async () => {
    let result: T;
    try {
      result = await call();
    } catch (error) {
      const refusal = purse.refusal;
      if (refusal) throw new AutomationStudioLlmBuildPurseRefused(refusal);
      throw error;
    }
    const refusal = purse.refusal;
    if (refusal) throw new AutomationStudioLlmBuildPurseRefused(refusal);
    return result;
  });
}
