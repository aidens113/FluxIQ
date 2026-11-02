import { automationStudioFlowDraftStepCarried } from "./step-carried.ts";

const MERGE_NODE_ID = "builtin.control.merge";

export function automationStudioFlowDraftStepCarriedJoin(step: {
    id?: string | undefined;
    actionId: string;
}): boolean {
    return step.actionId === MERGE_NODE_ID && automationStudioFlowDraftStepCarried(step);
}
