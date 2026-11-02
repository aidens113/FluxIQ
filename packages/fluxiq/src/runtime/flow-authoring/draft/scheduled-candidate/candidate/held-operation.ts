import type { AutomationStudioFlowDraftStep } from "../../step/index.ts";
import type { Held } from "./held.ts";

export const held = new WeakMap<AutomationStudioFlowDraftStep, Held>();
