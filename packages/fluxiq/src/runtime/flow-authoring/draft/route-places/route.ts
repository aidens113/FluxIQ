export type AutomationStudioFlowDraftRoute = {
    state: "named";
    quote: string;
    places: readonly string[];
} | {
    state: "open";
};
