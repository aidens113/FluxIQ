import type { JsonValue } from "../../../core/index.ts";
const MAX_WORDS = 120;
const MAX_DEPTH = 32;
export function automationStudioFlowDraftControlWords(value: unknown, evidence: JsonValue): string | undefined {
    if (typeof value !== "string")
        return undefined;
    const words = normalised(value);
    if (!words || /[\u0000-\u001f\u007f<>]/u.test(words))
        return undefined;
    if (!shownIn(evidence, words))
        return undefined;
    return words.length > MAX_WORDS ? `${words.slice(0, MAX_WORDS - 3).trimEnd()}...` : words;
}
function shownIn(evidence: JsonValue, words: string): boolean {
    const pending: Array<{
        value: JsonValue;
        depth: number;
    }> = [{ value: evidence, depth: 0 }];
    while (pending.length) {
        const { value, depth } = pending.pop()!;
        if (typeof value === "string") {
            if (value.includes(words) || normalised(value).includes(words))
                return true;
            continue;
        }
        if (value === null || typeof value !== "object" || depth >= MAX_DEPTH)
            continue;
        for (const item of Array.isArray(value) ? value : Object.values(value))
            pending.push({ value: item as JsonValue, depth: depth + 1 });
    }
    return false;
}
function normalised(text: string): string {
    return text.replace(/\s+/gu, " ").trim();
}
