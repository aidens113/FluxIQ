import type { AutomationStudioInputUnknownCode } from "./unknown.ts";

export type AutomationStudioInputRead<T> = { status: "bound"; value: T } | { status: "unknown"; code: AutomationStudioInputUnknownCode };
