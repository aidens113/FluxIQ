import { AsyncLocalStorage } from "node:async_hooks";
import type { AutomationStudioActivityControl, AutomationStudioActivityControlReader } from "../../../framework/automation-service/nodes/index.ts";

// The domain's reading of the control a step's parameters carry, for the words
// a card says. It is its implementation bundle's hook (`activityControlReader`),
// entered once with the build or run it serves (`../scope.ts`), because the
// sentences are said far below anything that knows a domain: from the executor,
// from a state route, from the model's calls and from a step's edit.
//
// It is scoped, as the presentation beside it is
// (`../../activity/presentation/scope.ts`): a value in the async context of one
// unit of work, so concurrent runs never share one and nothing registers it.
// A sentence said with none in scope names no control, and says its verb alone.

const storage = new AsyncLocalStorage<AutomationStudioActivityControlReader>();

/** Runs `fn` with the domain's reader in scope. With none, whatever `fn` is already under stays. */
export function runWithAutomationStudioActivityControlReader<T>(reader: AutomationStudioActivityControlReader | undefined, fn: () => T): T {
  return reader ? storage.run(reader, fn) : fn();
}

/** The control these parameters carry, as the domain in scope reads it; nothing when they carry none or no domain is in scope. */
export function automationStudioActivityControlOf(parameters: unknown): AutomationStudioActivityControl | undefined {
  return storage.getStore()?.(parameters);
}
