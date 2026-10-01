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

import { AsyncLocalStorage } from "node:async_hooks";
import type { AutomationStudioLlmBuildPurse } from "./purse.ts";
import { AutomationStudioLlmBuildPurseRefused } from "./refused.ts";

const purses = new AsyncLocalStorage<AutomationStudioLlmBuildPurse>();

/** The purse the current call is made under, if any. */
export function automationStudioLlmCurrentBuildPurse(): AutomationStudioLlmBuildPurse | undefined {
  return purses.getStore();
}

/**
 * Run `call` under `purse`. If the purse refused a call `call` made, throws
 * `AutomationStudioLlmBuildPurseRefused` whatever `call` itself returned or
 * threw: the refusal is the ending, and a caller's reading of the failed
 * result is not. Without a purse, runs `call` as it is.
 */
export async function automationStudioLlmBuildPurseRun<T>(purse: AutomationStudioLlmBuildPurse | undefined, call: () => Promise<T>): Promise<T> {
  if (!purse) return await call();
  purse.refusal = undefined;
  let result: T;
  try {
    result = await purses.run(purse, call);
  } catch (error) {
    if (purse.refusal) throw new AutomationStudioLlmBuildPurseRefused(purse.refusal);
    throw error;
  }
  if (purse.refusal) throw new AutomationStudioLlmBuildPurseRefused(purse.refusal);
  return result;
}
