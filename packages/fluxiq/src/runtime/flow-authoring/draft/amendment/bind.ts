import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import { automationStudioFlowDraftHoldsBinding, automationStudioFlowDraftIsBindingForm, automationStudioFlowDraftStoredBindingKind, automationStudioFlowDraftTranslateBindings } from "../bindings/index.ts";
import { automationStudioFlowDraftBindablePaths } from "../bindable/index.ts";
import { automationStudioFlowDraftRepeatIsWhile, automationStudioFlowDraftStepId } from "../routing/index.ts";
import { automationStudioFlowDraftStepIsProposed, type AutomationStudioFlowDraftStep } from "../step/index.ts";
import type { AutomationStudioFlowDraftShownNumbering } from "./shown-numbering/index.ts";
import type { AutomationStudioFlowDraftAmendment, AutomationStudioFlowDraftAmendmentRefusal } from "./contracts/index.ts";
const PARAMETERS_KEY = "parameters";
type BindRefusal = {
    ok: false;
    reason: AutomationStudioFlowDraftAmendmentRefusal["reason"];
    parameter?: string;
    control?: true;
    bindable?: string[];
};
type BindLeaf = {
    path: string[];
    form: JsonObject;
    replaced: JsonValue;
};
export function automationStudioFlowDraftAmendmentBind(steps: readonly AutomationStudioFlowDraftStep[], step: AutomationStudioFlowDraftStep, amendment: AutomationStudioFlowDraftAmendment, numbering?: AutomationStudioFlowDraftShownNumbering): {
    ok: true;
} | BindRefusal {
    if (!automationStudioFlowDraftStepIsProposed(step))
        return { ok: false, reason: "not_a_kept_step" };
    const argument = step.ranWith ?? step.input;
    const nested = isObject(argument[PARAMETERS_KEY]);
    const parameters = nested ? argument[PARAMETERS_KEY] as JsonObject : argument;
    const patch = amendment.input === undefined ? undefined : unwrappedPatch(amendment.input, nested);
    if (!patch || !Object.keys(patch).length)
        return { ok: false, reason: "bind_not_a_binding" };
    const leaves: BindLeaf[] = [];
    const shown = isObject(step.input[PARAMETERS_KEY]) ? step.input[PARAMETERS_KEY] as JsonObject : step.input;
    const problem = collectBindLeaves(patch, parameters, shown, [], leaves);
    if (problem)
        return problem.reason === "bind_new_key" ? { ...problem, bindable: automationStudioFlowDraftBindablePaths(step) } : problem;
    const bindings: {
        path: string[];
        binding: JsonObject;
    }[] = [];
    for (const leaf of leaves) {
        const parameter = leaf.path.join(".");
        let form = leaf.form;
        if (Object.hasOwn(form, "$input") && !Object.hasOwn(form, "test")) {
            const test = replacedTest(leaf.replaced);
            if (test === undefined)
                return { ok: false, reason: "bind_malformed", parameter };
            form = { ...form, test };
        }
        const translated = automationStudioFlowDraftTranslateBindings({ value: form }, numbering ? { steps, at: numbering.number(step), stepAt: (position) => numbering.step(position) } : { steps, at: step.position });
        const binding = translated.parameters.value;
        if (translated.refused.length || !isObject(binding))
            return { ok: false, reason: "bind_malformed", parameter };
        if (automationStudioFlowDraftStoredBindingKind(binding)?.kind === "row" && !insideRepeat(steps, step))
            return { ok: false, reason: "bind_row_outside_loop", parameter };
        bindings.push({ path: leaf.path, binding });
    }
    const unchanged = bindings.every(({ path, binding }) => JSON.stringify(valueAt(parameters, path)) === JSON.stringify(binding));
    if (unchanged && amendment.settings === undefined)
        return { ok: false, reason: "already_so" };
    if (step.instance === undefined && step.written !== true && step.checkedCandidate === undefined && !automationStudioFlowDraftHoldsBinding(argument))
        step.instance = structuredClone(argument);
    for (const { path, binding } of bindings) {
        if (step.ranWith)
            setAt(containerOf(step.ranWith, nested), path, binding);
        if (step.input !== step.ranWith)
            setAt(containerOf(step.input, nested), path, binding);
    }
    if (amendment.settings)
        step.settings = { ...(step.settings ?? {}), ...amendment.settings };
    return { ok: true };
}
function unwrappedPatch(patch: JsonObject, nested: boolean): JsonObject {
    const keys = Object.keys(patch);
    return nested && keys.length === 1 && keys[0] === PARAMETERS_KEY && isObject(patch[PARAMETERS_KEY]) ? patch[PARAMETERS_KEY] as JsonObject : patch;
}
function collectBindLeaves(patch: JsonObject, existing: JsonObject, shown: JsonObject | undefined, path: string[], leaves: BindLeaf[]): BindRefusal | undefined {
    for (const [key, value] of Object.entries(patch)) {
        const at = [...path, key];
        const parameter = at.join(".");
        const has = Object.hasOwn(existing, key);
        const newKey = (): BindRefusal => ({ ok: false, reason: "bind_new_key", parameter, ...(shown !== undefined && Object.hasOwn(shown, key) ? { control: true as const } : {}) });
        if (automationStudioFlowDraftIsBindingForm(value)) {
            if (!has)
                return newKey();
            leaves.push({ path: at, form: value, replaced: existing[key]! });
            continue;
        }
        if (!isObject(value) || Object.hasOwn(value, "$state") || !Object.keys(value).length)
            return { ok: false, reason: "bind_not_a_binding", parameter };
        if (!has)
            return newKey();
        const below = existing[key];
        if (!isObject(below) || Object.hasOwn(below, "$state"))
            return { ok: false, reason: "bind_not_a_binding", parameter };
        const shownBelow = shown?.[key];
        const problem = collectBindLeaves(value, below, isObject(shownBelow) ? shownBelow : undefined, at, leaves);
        if (problem)
            return problem;
    }
    return undefined;
}
function replacedTest(replaced: JsonValue): JsonValue | undefined {
    if (replaced === null)
        return undefined;
    const stored = automationStudioFlowDraftStoredBindingKind(replaced);
    if (stored)
        return stored.kind === "input" ? stored.test : undefined;
    return automationStudioFlowDraftHoldsBinding(replaced) ? undefined : replaced;
}
function insideRepeat(steps: readonly AutomationStudioFlowDraftStep[], step: AutomationStudioFlowDraftStep): boolean {
    const at = steps.indexOf(step);
    return steps.some((first, start) => {
        if (first.routing?.kind !== "repeat" || automationStudioFlowDraftRepeatIsWhile(first.routing))
            return false;
        const through = first.routing.through;
        const end = steps.findIndex((candidate) => automationStudioFlowDraftStepId(candidate) === through);
        return at === start || (end >= start && at >= start && at <= end);
    });
}
function containerOf(argument: JsonObject, nested: boolean): JsonObject {
    if (!nested)
        return argument;
    if (!isObject(argument[PARAMETERS_KEY]))
        argument[PARAMETERS_KEY] = {};
    return argument[PARAMETERS_KEY] as JsonObject;
}
function valueAt(root: JsonObject, path: readonly string[]): JsonValue | undefined {
    let value: JsonValue | undefined = root;
    for (const key of path)
        value = isObject(value) ? value[key] : undefined;
    return value;
}
function setAt(root: JsonObject, path: readonly string[], value: JsonValue): void {
    let target = root;
    for (const key of path.slice(0, -1)) {
        if (!isObject(target[key]))
            target[key] = {};
        target = target[key] as JsonObject;
    }
    target[path[path.length - 1]!] = structuredClone(value);
}
function isObject(value: JsonValue | undefined): value is JsonObject {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
