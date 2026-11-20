import type { AutomationStudioInputUseUnknown } from "./unknown.ts";

export type AutomationStudioInputUseRead<T> = { status: "bound"; value: T } | { status: "unknown"; code: AutomationStudioInputUseUnknown };
