import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDocument } from "../../../model/index.ts";
import type { AutomationStudioRuntimeSessionLlm } from "../../llm/index.ts";
import type { AutomationStudioActionConsequence } from "../../action-permissions/index.ts";
import type { AutomationStudioRuntimeInterventionMode, AutomationStudioResultCheckCallerPays } from "../runtime-adaptation/index.ts";

/** Existing run facade input; required mode is additive and restrictive. */
export type AutomationStudioRuntimeSessionRunInput = {
    projectId?: string | null;
    /** Explicit infrastructure mode; receipt handling does not certify semantic acceptance. */
    commandOutcomeMode?: "required";
    runId?: string; newRunId?: string;
    flow?: AutomationStudioFlowDocument;
    flowId?: string;
    inputs?: JsonObject;
    maxSteps?: number;
    authorizedDomainIds?: string[];
    adaptiveMode?: AutomationStudioRuntimeInterventionMode;
    dryRunLlm?: boolean;
    authorizedExternalSideEffects?: boolean;
    subflowId?: string;
    idempotencyKey?: string;
    /** A person asked the model into this run: who (whose key pays) and what for. Nothing is authorized by it. */
    llmExecution?: AutomationStudioRuntimeSessionLlm;
    /** The lasting consequences the person already allowed this run's actions to have. Anything else is asked about act by act. */
    permittedConsequences?: AutomationStudioActionConsequence[];
    useReusableContext?: true; /** Which of this run's result checks `llmExecution`'s caller pays for; absent is every one (`resolveAutomationStudioResultCheckProvider`). */ resultCheckCallerPays?: AutomationStudioResultCheckCallerPays;
    /** What the chat's reading of the message that started this run cost, when a chat turn started it: the Flow's spend in a Lab-scoped run (t438). */
    interpretationCostUsd?: number;
    /** How many priced model calls `interpretationCostUsd` sums: the Flow spend's "chat" calls. */
    interpretationCalls?: number;
};
