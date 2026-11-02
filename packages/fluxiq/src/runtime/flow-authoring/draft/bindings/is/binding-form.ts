import type { JsonValue, JsonObject } from "../../../../../core/index.ts";
import { isObject } from "./object.ts";

const FORM_KEYS = ["$row", "$input", "$step"] as const;

export function automationStudioFlowDraftIsBindingForm(value: JsonValue | undefined): value is JsonObject {
    return isObject(value) && FORM_KEYS.some((key) => Object.hasOwn(value, key));
}
