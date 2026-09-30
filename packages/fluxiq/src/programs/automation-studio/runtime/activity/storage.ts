import { AsyncLocalStorage } from "node:async_hooks";
import type { AutomationStudioActivityFrame } from "./contracts.ts";

/**
 * The unit of work the current async context belongs to (D3), so an emission
 * site deep in the executor needs no parameter threaded down to it.
 */
export const automationStudioActivityStorage = new AsyncLocalStorage<AutomationStudioActivityFrame>();
