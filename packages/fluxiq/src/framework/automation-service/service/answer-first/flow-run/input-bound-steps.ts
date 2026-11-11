// The static check that makes a caller's input values Flow inputs (fluxnode-plan N2): every fixed
// value a saved step was written with that equals one of this attempt's input values becomes a binding
// to that input, `{"$state":{"path":<name>,"fallback":<value>}}` -- the form a model's own `$input`
// is stored as (`runtime/flow-authoring/draft/binding-forms.ts`), which the engine resolves against
// a run's inputs (`./flow-run.ts` hands it the attempt's). So a later attempt with other values
// replays the same Flow on them, and the value it was learned with is the step's default.
//
// **No model, no guess.** Equality only, of the whole value: text equal to an input's text, or a
// number equal to an input's number where it is a step's own parameter (one level down, a count is as
// likely to be a retry's or a list's own setting as the person's). A value two inputs share binds to
// neither, since nothing says which one it was. A name the draft's binding rules refuse
// (`AUTOMATION_STUDIO_FLOW_DRAFT_INPUT_NAME`, or the row's own name) stays fixed text.
//
// **What it leaves alone:** a value already bound, and the settings a step carries about itself
// rather than about the task: the record output it writes to, the state it checks for, its retry.
//
// **A secret input keeps no default** (`runtime/run-secrets/`; a FluxNode's `format: "secret"`). Its value
// is not among the attempt's inputs; it travels beside the run. A value equal to it binds to its name
// with no fallback, and a binding already to its name loses any fallback it holds (a model's stand-in
// test value), so the saved Flow, its export and its pinned copies never hold one. A run with no value
// for it then has nothing to type, which fails the step rather than typing a remembered secret.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { automationStudioRunSecrets } from "../../../../../runtime/run-secrets/index.ts";
import { automationStudioFlowDraftIsBindingForm, AUTOMATION_STUDIO_FLOW_DRAFT_INPUT_NAME, type AutomationStudioFlowDraftStep } from "../../../../../runtime/flow-authoring/draft/index.ts";
import { automationNodeStateBinding, isAutomationNodeParameterStateBinding, type AutomationNodeParameterStateBinding } from "../../../nodes/index.ts";

/** The parameters a step holds about itself, never a value the task was given. */
const OWN_SETTINGS: ReadonlySet<string> = new Set(["recordOutput", "ensureState", "expectedState", "retry"]);
/** The name a row goes by in run state (`binding-forms.ts`), which no input may take. */
const ROW_NAME = "item";
/** As deep as the executor resolves a binding. */
const MOST_DEPTH = 16;

type Bindable = { text: Map<string, string>; numbers: Map<number, string>; secrets: ReadonlySet<string> };

/** The steps with each value equal to an input value bound to that input; a step with none comes back as it was. */
export function automationStudioAnswerFirstInputBoundSteps(steps: readonly AutomationStudioFlowDraftStep[], inputs: Readonly<Record<string, JsonValue>> | undefined): AutomationStudioFlowDraftStep[] {
  const secrets = automationStudioRunSecrets() ?? {};
  const bindable = bindableOf({ ...(inputs ?? {}), ...secrets }, new Set(Object.keys(secrets)));
  if (bindable.text.size === 0 && bindable.numbers.size === 0) return [...steps];
  return steps.map((step) => boundStep(step, bindable));
}

function bindableOf(inputs: Readonly<Record<string, JsonValue>>, secrets: ReadonlySet<string>): Bindable {
  const text = new Map<string, string | null>();
  const numbers = new Map<number, string | null>();
  for (const [name, value] of Object.entries(inputs)) {
    if (!AUTOMATION_STUDIO_FLOW_DRAFT_INPUT_NAME.test(name) || name === ROW_NAME) continue;
    // A second input with the same value makes it nobody's (null).
    if (typeof value === "string" && value.trim() !== "") text.set(value, text.has(value) ? null : name);
    else if (typeof value === "number" && Number.isFinite(value)) numbers.set(value, numbers.has(value) ? null : name);
  }
  return { text: owned(text), numbers: owned(numbers), secrets };
}

function owned<Key>(map: Map<Key, string | null>): Map<Key, string> {
  return new Map([...map].filter((entry): entry is [Key, string] => entry[1] !== null));
}

function boundStep(step: AutomationStudioFlowDraftStep, bindable: Bindable): AutomationStudioFlowDraftStep {
  const input = boundCall(step.input, bindable);
  const ranWith = step.ranWith === undefined ? undefined : boundCall(step.ranWith, bindable);
  if (input === step.input && ranWith === step.ranWith) return step;
  return { ...step, input, ...(ranWith === undefined ? {} : { ranWith }) };
}

/** A call's value with its `parameters` bound, or the same object when nothing in them was. */
function boundCall(call: JsonObject, bindable: Bindable): JsonObject {
  const parameters = call.parameters;
  if (typeof parameters !== "object" || parameters === null || Array.isArray(parameters)) return call;
  let changed = false;
  const bound: JsonObject = {};
  for (const [key, value] of Object.entries(parameters)) {
    const next = OWN_SETTINGS.has(key) ? value : boundValue(value, bindable, 1);
    if (next !== value) changed = true;
    bound[key] = next;
  }
  return changed ? { ...call, parameters: bound } : call;
}

function boundValue(value: JsonValue, bindable: Bindable, depth: number): JsonValue {
  if (depth > MOST_DEPTH || automationStudioFlowDraftIsBindingForm(value)) return value;
  if (isAutomationNodeParameterStateBinding(value)) return withoutSecretFallback(value, bindable);
  if (typeof value === "string") return bindingFor(bindable.text.get(value), value, bindable);
  if (typeof value === "number") return depth === 1 ? bindingFor(bindable.numbers.get(value), value, bindable) : value;
  if (Array.isArray(value)) return list(value, bindable, depth);
  if (value !== null && typeof value === "object") return record(value, bindable, depth);
  return value;
}

function bindingFor(name: string | undefined, value: string | number, bindable: Bindable): JsonValue {
  if (name === undefined) return value;
  return automationNodeStateBinding(name, bindable.secrets.has(name) ? undefined : value) as unknown as JsonValue;
}

/** A binding to a secret input, or with a secret as its default, without that default; any other binding as it is. */
function withoutSecretFallback(value: AutomationNodeParameterStateBinding, bindable: Bindable): JsonValue {
  const { path, fallback } = value.$state;
  if (fallback === undefined) return value;
  const secret = bindable.secrets.has(path) || (typeof fallback === "string" && bindable.secrets.has(bindable.text.get(fallback) ?? ""));
  return (secret ? automationNodeStateBinding(path) : value) as unknown as JsonValue;
}

function list(value: readonly JsonValue[], bindable: Bindable, depth: number): JsonValue {
  const bound = value.map((item) => boundValue(item, bindable, depth + 1));
  return bound.some((item, index) => item !== value[index]) ? bound : value as JsonValue;
}

function record(value: JsonObject, bindable: Bindable, depth: number): JsonValue {
  let changed = false;
  const bound: JsonObject = {};
  for (const [key, item] of Object.entries(value)) {
    const next = OWN_SETTINGS.has(key) ? item : boundValue(item, bindable, depth + 1);
    if (next !== item) changed = true;
    bound[key] = next;
  }
  return changed ? bound : value;
}
