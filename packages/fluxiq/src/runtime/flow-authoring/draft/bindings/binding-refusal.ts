export type AutomationStudioFlowDraftBindingRefusal = {
    path: string;
    reason: "malformed" | "step_binding_not_yet" | "step_missing" | "step_not_earlier" | "step_not_usable" | "step_output_unknown";
};
