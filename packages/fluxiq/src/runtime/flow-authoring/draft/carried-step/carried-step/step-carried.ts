const CARRIED_STEP_ID = /^f[1-9][0-9]*$/u;

export function automationStudioFlowDraftStepCarried(step: {
    id?: string | undefined;
}): boolean {
    return typeof step.id === "string" && CARRIED_STEP_ID.test(step.id);
}
