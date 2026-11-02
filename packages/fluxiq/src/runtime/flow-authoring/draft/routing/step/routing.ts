export type AutomationStudioFlowDraftStepRouting = {
    kind: "optional";
} | {
    kind: "only_if";
    check: string;
} | {
    kind: "on_failed";
    to: string;
} | {
    kind: "repeat";
    through: string;
    over: string;
    while?: never;
    most?: number;
} | {
    kind: "repeat";
    through: string;
    while: string;
    most?: number;
    over?: never;
};
