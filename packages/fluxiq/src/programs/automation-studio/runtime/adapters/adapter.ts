import type { RuntimeAdapter } from "../../../../runtime/adapters/index.ts";
import type { StateSnapshot, StatePathSchema, ActionDefinition, ActionResult } from "../../model/index.ts";

export type AutomationStudioRuntimeAdapter = RuntimeAdapter<StateSnapshot, StatePathSchema, ActionDefinition, ActionResult>;
