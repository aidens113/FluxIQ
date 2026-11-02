import type { JsonValue } from "../../../../core/index.ts";

const NONE = "none";

export function automationStudioFlowDraftDeclaresLasting(declared: JsonValue | undefined): boolean {
    if (declared === undefined)
        return false;
    const words = Array.isArray(declared) ? declared : typeof declared === "string" ? declared.split(",") : undefined;
    if (!words)
        return true;
    return words.some((word) => typeof word !== "string" || (word.trim().length > 0 && word.trim().toLowerCase() !== NONE));
}
