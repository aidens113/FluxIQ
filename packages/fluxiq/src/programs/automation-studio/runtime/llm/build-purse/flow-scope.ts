// The Flow's one purse, carried with the async work as the build's purse is
// (`./run.ts`), in a Lab-scoped run only (t438).
//
// **The rule.** The user's words (2026-10-01): "bring the ceiling down to $0.1
// per flow max". One purse per Flow: its build, re-authors, repairs and judge
// all count against it, in billed dollars, with no cap on output. Each part
// keeps its own purse or ledger as before, and every call any of them makes is
// also held against this one (`./harness-hold.ts`): its spend is the Flow's
// record, read live, so a part started after another sees what that one spent,
// and every settled call is written to the record as it settles
// (`../../service/creation-spend.ts`). So a run's in-run repairs, its post-run
// recovery, its result check and its re-authors draw on what the Flow's
// creation left, whether the run then succeeds or fails.
//
// **Separate from the build's purse.** A re-author's build runs under its own
// build purse inside a run that is under the Flow's; both hold each call.

import { AsyncLocalStorage } from "node:async_hooks";
import type { AutomationStudioLlmBuildPurse } from "./purse.ts";

const flowPurses = new AsyncLocalStorage<AutomationStudioLlmBuildPurse>();

/** The Flow's purse the current call is made under, if any: only in a Lab-scoped run. */
export function automationStudioLlmCurrentFlowPurse(): AutomationStudioLlmBuildPurse | undefined {
  return flowPurses.getStore();
}

/** Make every call inside `call` under the Flow's `purse` as well as any build purse it opens. */
export async function automationStudioLlmFlowPurseScope<T>(purse: AutomationStudioLlmBuildPurse, call: () => Promise<T>): Promise<T> {
  return await flowPurses.run(purse, call);
}
