import type { AutomationStudioActivityScope } from "./contracts.ts";
import { automationStudioActivityStorage } from "./storage.ts";

/**
 * Runs `fn` as one unit of work: every `emitAutomationStudioActivity` it
 * reaches, however deep, is published under `scope`. `pending` holds emission
 * back until `bindAutomationStudioActivityRun` names the run.
 */
export function runWithAutomationStudioActivity<T>(scope: AutomationStudioActivityScope, fn: () => T, options: { pending?: boolean } = {}): T {
  return automationStudioActivityStorage.run({ scope: { ...scope }, pending: options.pending === true }, fn);
}
