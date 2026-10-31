import type { AutomationStudioGraphExecutionOptions, AutomationStudioGraphExecutionTrace } from "../executor/contracts.ts";

type Invocation = AutomationStudioGraphExecutionOptions["invocation"];
const owners = new WeakMap<AutomationStudioGraphExecutionTrace, NonNullable<Invocation>["run"]>();

/** Private frame-writer capability and read-only same-run checks; no public JSON grants authority. */
export const automationStudioRuntimeRepeatTraceProvenance = Object.freeze({
  frame(invocation: Invocation) {
    const owner = invocation?.run;
    return {
      remember(trace: AutomationStudioGraphExecutionTrace): void {
        if (owner) owners.set(trace, owner);
      },
      copy(from: AutomationStudioGraphExecutionTrace, to: AutomationStudioGraphExecutionTrace): void {
        if (owner && owners.get(from) === owner) owners.set(to, owner);
      }
    };
  },
  stopped(trace: AutomationStudioGraphExecutionTrace, invocation: Invocation): boolean {
    return invocation !== undefined && owners.get(trace) === invocation.run;
  }
});
