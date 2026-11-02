import type { AutomationStudioFlowDraftStep } from "../step/index.ts";

export type AutomationStudioFlowDraftBindingContext = {
    steps: readonly AutomationStudioFlowDraftStep[];
    at?: number | undefined;
    stepAt?: ((position: number) => AutomationStudioFlowDraftStep | undefined) | undefined;
    nodeOf?: ((nodeId: string) => {
        readonly outputs: readonly {
            readonly id: string;
        }[];
    } | undefined) | undefined;
};
