import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioFlowDraftStepReplay, AutomationStudioFlowDraftReplayOutcome } from "../replay/index.ts";
import type { AutomationStudioFlowDraftStepRouting } from "../routing/index.ts";
import type { AutomationStudioFlowDraftScheduledCandidate } from "../scheduled-candidate/index.ts";
import type { AutomationStudioFlowDraftStepChange } from "./change.ts";
import type { AutomationStudioFlowDraftStepCondition } from "./condition.ts";
import type { AutomationStudioFlowDraftStepDisposition } from "./disposition.ts";
import type { AutomationStudioFlowDraftStepEffect } from "./effect.ts";
import type { AutomationStudioFlowDraftStepToggle } from "./toggle.ts";
import type { AutomationStudioFlowDraftStepWords } from "./words.ts";

export type AutomationStudioFlowDraftStep = {
    position: number;
    id?: string;
    iteration: number;
    callId?: string;
    actionId: string;
    toolId?: string;
    input: JsonObject;
    ranWith?: JsonObject;
    scheduledCandidate?: AutomationStudioFlowDraftScheduledCandidate;
    control?: string;
    interruption?: true;
    toggle?: AutomationStudioFlowDraftStepToggle;
    changed?: AutomationStudioFlowDraftStepChange[];
    reads?: string;
    conditions?: AutomationStudioFlowDraftStepCondition[];
    cancels?: string;
    words?: AutomationStudioFlowDraftStepWords;
    effect: AutomationStudioFlowDraftStepEffect;
    effectApplied?: boolean;
    resultCode?: string;
    stateBefore?: string;
    stateAfter?: string;
    disposition: AutomationStudioFlowDraftStepDisposition;
    proposes?: boolean;
    settings?: JsonObject;
    replay?: AutomationStudioFlowDraftStepReplay;
    replayed?: AutomationStudioFlowDraftReplayOutcome;
    routing?: AutomationStudioFlowDraftStepRouting;
    acts?: string[];
    places?: string[];
    standsFor?: string;
    replacedBy?: string;
    routeSignatures?: JsonObject;
    paceMs?: number;
    written?: true;
    checkedCandidate?: {
        callId: string;
        code: string;
    };
    priorExecution?: Omit<AutomationStudioFlowDraftStep, "priorExecution" | "checkedCandidate"> & {
        lasting: true;
    };
    rerunPlace?: {
        kind: "put_back";
        redone: string[];
        unknownBefore?: number;
    } | {
        kind: "already_there";
    } | {
        kind: "start_page_unknown";
    };
    instance?: JsonObject;
};
