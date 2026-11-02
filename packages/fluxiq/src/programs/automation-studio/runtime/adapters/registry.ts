import { RuntimeAdapterRegistry } from "../../../../runtime/adapters/index.ts";
import type { AutomationStudioRuntimeAdapter } from "./adapter.ts";

// Specialize types without wrapping the canonical constructor.
export const AutomationStudioAdapterRegistry = RuntimeAdapterRegistry<AutomationStudioRuntimeAdapter>;
export type AutomationStudioAdapterRegistry = RuntimeAdapterRegistry<AutomationStudioRuntimeAdapter>;
