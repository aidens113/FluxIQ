import type { JsonObject } from "../../../core/index.ts";
import type { AutomationStudioFlowDraftStepWords } from "./step/index.ts";
const MAX_WORDS = 160;
export function automationStudioFlowDraftStepWordsOf(describe: ((call: {
    toolId: string;
    value: JsonObject;
}) => unknown) | undefined, call: {
    toolId: string;
    value: JsonObject;
}): AutomationStudioFlowDraftStepWords | undefined {
    if (!describe)
        return undefined;
    const answer: unknown = describe({ toolId: call.toolId, value: call.value });
    if (!answer || typeof answer !== "object" || Array.isArray(answer))
        return undefined;
    const target = said((answer as {
        target?: unknown;
    }).target);
    const text = said((answer as {
        text?: unknown;
    }).text);
    if (target === undefined && text === undefined)
        return undefined;
    return { ...(target === undefined ? {} : { target }), ...(text === undefined ? {} : { text }) };
}
function said(value: unknown): string | undefined {
    if (typeof value !== "string")
        return undefined;
    const folded = value.replace(/[\u0000-\u001f\u007f]+/gu, " ").replace(/\s+/gu, " ").trim();
    if (!folded)
        return undefined;
    return folded.length > MAX_WORDS ? `${folded.slice(0, MAX_WORDS - 3).trimEnd()}...` : folded;
}
