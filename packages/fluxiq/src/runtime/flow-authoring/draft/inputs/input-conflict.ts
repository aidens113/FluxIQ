import type { JsonValue } from "../../../../core/index.ts";

export type AutomationStudioFlowDraftInputConflict = {
    name: string;
    tests: JsonValue[];
    steps: number[];
};
