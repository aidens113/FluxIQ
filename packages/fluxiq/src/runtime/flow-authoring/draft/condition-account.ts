import type { JsonValue } from "../../../core/index.ts";
import { automationStudioFlowDraftControlWords } from "./control-words.ts";
import type { AutomationStudioFlowDraftStepCondition } from "./step/index.ts";
const MOST_VALUES = 3;
export function automationStudioFlowDraftConditionAccount(value: unknown, evidence: JsonValue): AutomationStudioFlowDraftStepCondition[] | undefined {
    if (!Array.isArray(value) || value.length === 0)
        return undefined;
    const account: AutomationStudioFlowDraftStepCondition[] = [];
    for (const entry of value) {
        if (!isRecord(entry) || !Object.keys(entry).every((key) => key === "kept" || key === "rejected" || key === "keptValues"))
            return undefined;
        if (!isCount(entry.kept) || !isCount(entry.rejected))
            return undefined;
        const values = entry.keptValues ?? [];
        if (!Array.isArray(values) || !values.every((item) => typeof item === "string"))
            return undefined;
        const keptValues = values.flatMap((item) => automationStudioFlowDraftControlWords(item, evidence) ?? []).slice(0, MOST_VALUES);
        account.push({ kept: entry.kept, rejected: entry.rejected, keptValues });
    }
    return account;
}
function isCount(value: unknown): value is number {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
