import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../step/index.ts";

export const saved = new WeakMap<AutomationStudioFlowDraftStep, JsonObject>();
