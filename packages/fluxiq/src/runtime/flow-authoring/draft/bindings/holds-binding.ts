import type { JsonValue } from "../../../../core/index.ts";
import { holds } from "./holds.ts";

export function automationStudioFlowDraftHoldsBinding(value: JsonValue | undefined): boolean {
    return holds(value, 0);
}
