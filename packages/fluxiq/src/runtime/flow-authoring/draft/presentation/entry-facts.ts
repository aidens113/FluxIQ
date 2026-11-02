export type DraftEntryInstructionFacts = {
    mode: "authored" | "transcript";
    hasBindable: boolean;
    routeKind: "none" | "named" | "open";
    hasReplaced: boolean;
    hasChecked: boolean;
};
