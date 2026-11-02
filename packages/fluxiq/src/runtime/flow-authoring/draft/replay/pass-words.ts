import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioFlowDraftReplayOutcome } from "./outcome/index.ts";

export function automationStudioFlowDraftReplayPassWords(outcome: AutomationStudioFlowDraftReplayOutcome): JsonObject {
    if (!outcome.passes)
        return {};
    const blocking = outcome.passes.find((pass) => pass.status !== "replayed");
    return { passes: outcome.passes.length, ...(blocking ? { pass: blocking.pass } : {}) };
}
