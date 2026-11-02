import { isAutomationNodeParameterStateBinding } from "../../../../../components/automation/index.ts";
import type { JsonValue } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_FLOW_DRAFT_INPUT_NAME } from "../input-name.ts";
import { isField } from "../is/index.ts";
import { OUTPUT_ID } from "../output-id.ts";
import { AUTOMATION_STUDIO_FLOW_DRAFT_ROW_FIELD } from "../row-field.ts";
import { ROW_NAME } from "../row-name.ts";
import { STEP_ID } from "../step/index.ts";
import { AUTOMATION_STUDIO_FLOW_DRAFT_STEP_OUTPUT_ROOT } from "../step/index.ts";
import type { AutomationStudioFlowDraftStoredBinding } from "./binding.ts";

export function automationStudioFlowDraftStoredBindingKind(value: JsonValue | undefined): AutomationStudioFlowDraftStoredBinding | undefined {
    if (!isAutomationNodeParameterStateBinding(value))
        return undefined;
    const state = value.$state;
    const path = state.path;
    if (path.startsWith(`${AUTOMATION_STUDIO_FLOW_DRAFT_STEP_OUTPUT_ROOT}.`)) {
        const [, step, output, ...fields] = path.split(".");
        if (state.fallback !== undefined || step === undefined || !STEP_ID.test(step) || output === undefined || !OUTPUT_ID.test(output) || !fields.every(isField))
            return undefined;
        return { kind: "step", step, output, ...(fields.length ? { path: fields.join(".") } : {}) };
    }
    if (path.startsWith(`${ROW_NAME}.`)) {
        const field = path.slice(ROW_NAME.length + 1);
        return AUTOMATION_STUDIO_FLOW_DRAFT_ROW_FIELD.test(field) ? { kind: "row", field } : undefined;
    }
    if (path.includes(".") || state.fallback === undefined || !AUTOMATION_STUDIO_FLOW_DRAFT_INPUT_NAME.test(path) || path === ROW_NAME)
        return undefined;
    return { kind: "input", name: path, test: state.fallback };
}
