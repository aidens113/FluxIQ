import type { JsonValue } from "../../../../core/index.ts";

export type AutomationStudioFlowDraftInput = {
    name: string;
    test: JsonValue;
    steps: number[];
};
