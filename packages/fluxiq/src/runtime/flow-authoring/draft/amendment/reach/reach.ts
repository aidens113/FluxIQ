import type { Step } from "./step.ts";

export type AutomationStudioFlowDraftReach = {
    flow: readonly Step[];
    unreached: ReadonlySet<Step>;
    noWay: ReadonlySet<Step>;
    page(step: Step): string | undefined;
    leaves(step: Step): string | undefined;
    moves(step: Step): boolean;
};
