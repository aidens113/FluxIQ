import type { AutomationStudioFlowDraftStep } from "../../step/index.ts";
import { configuration } from "./configuration.ts";
import { held } from "./held-operation.ts";
import { read } from "./read.ts";

export function automationStudioFlowDraftCopyScheduledCandidate(source: AutomationStudioFlowDraftStep, copy: AutomationStudioFlowDraftStep): void {
    const original = read(source);
    if (!original || configuration({ ...copy, position: source.position }) !== original.configuration)
        return;
    held.set(copy, { ...original, configuration: configuration(copy) });
}
