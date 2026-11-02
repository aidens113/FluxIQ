import type { JsonValue } from "../../../../../core/index.ts";

export type AutomationStudioFlowDraftStoredBinding = {
    kind: "row";
    field: string;
} | {
    kind: "input";
    name: string;
    test: JsonValue;
} | {
    kind: "step";
    step: string;
    output: string;
    path?: string;
};
