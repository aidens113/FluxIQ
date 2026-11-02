import { isAutomationNodeParameterStateBinding, automationNodeStateBinding } from "../../../../components/automation/index.ts";
import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import { automationStudioFlowDraftStepId } from "../routing/index.ts";
import { automationStudioFlowDraftStepIsProposable } from "../step/index.ts";
import type { AutomationStudioFlowDraftBindingContext } from "./binding-context.ts";
import type { AutomationStudioFlowDraftBindingRefusal } from "./binding-refusal.ts";
import { holds } from "./holds.ts";
import { AUTOMATION_STUDIO_FLOW_DRAFT_INPUT_NAME } from "./input-name.ts";
import { automationStudioFlowDraftIsBindingForm } from "./is/index.ts";
import { isField } from "./is/index.ts";
import { isObject } from "./is/index.ts";
import { MAXIMUM_DEPTH } from "./maximum-depth.ts";
import { OUTPUT_ID } from "./output-id.ts";
import { AUTOMATION_STUDIO_FLOW_DRAFT_ROW_FIELD } from "./row-field.ts";
import { ROW_NAME } from "./row-name.ts";
import { STEP_ID } from "./step/index.ts";
import { AUTOMATION_STUDIO_FLOW_DRAFT_STEP_OUTPUT_ROOT } from "./step/index.ts";

export function automationStudioFlowDraftTranslateBindings(parameters: JsonObject, context?: AutomationStudioFlowDraftBindingContext): {
    parameters: JsonObject;
    refused: AutomationStudioFlowDraftBindingRefusal[];
} {
    const refused: AutomationStudioFlowDraftBindingRefusal[] = [];
    const translated = translateValue(parameters, [], refused, 0, context);
    return { parameters: isObject(translated) ? translated : {}, refused };
}

function translateValue(value: JsonValue, path: string[], refused: AutomationStudioFlowDraftBindingRefusal[], depth: number, context: AutomationStudioFlowDraftBindingContext | undefined): JsonValue | undefined {
    if (depth > MAXIMUM_DEPTH)
        return value;
    if (automationStudioFlowDraftIsBindingForm(value)) {
        const translated = translateForm(value, context);
        if ("reason" in translated) {
            refused.push({ path: path.join("."), reason: translated.reason });
            return undefined;
        }
        return translated.binding;
    }
    if (Array.isArray(value)) {
        const out: JsonValue[] = [];
        value.forEach((item, index) => {
            const translated = translateValue(item, [...path, String(index)], refused, depth + 1, context);
            if (translated !== undefined)
                out.push(translated);
        });
        return out;
    }
    if (!isObject(value) || isAutomationNodeParameterStateBinding(value))
        return value;
    const out: JsonObject = {};
    for (const [key, item] of Object.entries(value)) {
        const translated = translateValue(item, [...path, key], refused, depth + 1, context);
        if (translated !== undefined)
            out[key] = translated;
    }
    return out;
}

function translateForm(form: JsonObject, context: AutomationStudioFlowDraftBindingContext | undefined): {
    binding: JsonObject;
} | {
    reason: AutomationStudioFlowDraftBindingRefusal["reason"];
} {
    const keys = Object.keys(form);
    if (Object.hasOwn(form, "$step"))
        return translateStepForm(form, context);
    if (Object.hasOwn(form, "$row")) {
        const field = form.$row;
        if (keys.length !== 1 || typeof field !== "string" || !AUTOMATION_STUDIO_FLOW_DRAFT_ROW_FIELD.test(field))
            return { reason: "malformed" };
        return { binding: automationNodeStateBinding(`${ROW_NAME}.${field}`) as unknown as JsonObject };
    }
    const name = form.$input;
    const test = form.test;
    if (keys.some((key) => key !== "$input" && key !== "test") || typeof name !== "string")
        return { reason: "malformed" };
    if (!AUTOMATION_STUDIO_FLOW_DRAFT_INPUT_NAME.test(name) || name === ROW_NAME)
        return { reason: "malformed" };
    if (test === undefined || test === null || holds(test, 0))
        return { reason: "malformed" };
    return { binding: automationNodeStateBinding(name, structuredClone(test)) as unknown as JsonObject };
}

function translateStepForm(form: JsonObject, context: AutomationStudioFlowDraftBindingContext | undefined): {
    binding: JsonObject;
} | {
    reason: AutomationStudioFlowDraftBindingRefusal["reason"];
} {
    if (!context)
        return { reason: "step_binding_not_yet" };
    const position = form.$step;
    const output = form.output;
    const field = form.path;
    if (Object.keys(form).some((key) => key !== "$step" && key !== "output" && key !== "path"))
        return { reason: "malformed" };
    if (typeof position !== "number" || !Number.isSafeInteger(position) || position < 1)
        return { reason: "malformed" };
    if (typeof output !== "string" || !OUTPUT_ID.test(output))
        return { reason: "malformed" };
    if (field !== undefined && (typeof field !== "string" || !field.split(".").every(isField)))
        return { reason: "malformed" };
    if (context.at !== undefined && position >= context.at)
        return { reason: "step_not_earlier" };
    const source = context.stepAt ? context.stepAt(position) : context.steps.find((step) => step.position === position);
    if (!source)
        return { reason: "step_missing" };
    const id = automationStudioFlowDraftStepId(source);
    const withdrawn = source.disposition === "dropped" || source.disposition === "exploratory";
    if (withdrawn || !automationStudioFlowDraftStepIsProposable(source) || !STEP_ID.test(id))
        return { reason: "step_not_usable" };
    const node = context.nodeOf?.(source.actionId);
    if (node && !node.outputs.some((port) => port.id === output))
        return { reason: "step_output_unknown" };
    const stored = [AUTOMATION_STUDIO_FLOW_DRAFT_STEP_OUTPUT_ROOT, id, output, ...(field === undefined ? [] : [field])].join(".");
    return { binding: automationNodeStateBinding(stored) as unknown as JsonObject };
}
