// A value a model wrote as a binding, read as the state binding it names.
//
// Split out of `./assemble.ts`, which reads a step's lines and a part's
// outputs through it; nothing else does. What each form stores is said on
// `automationStudioScriptBinding` below.
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { AUTOMATION_NODE_OUTPUT_REFERENCE_ROOT, type AutomationNodeParameter } from "../../../nodes/index.ts";
import { AUTOMATION_STUDIO_FLOW_DRAFT_INPUT_NAME, AUTOMATION_STUDIO_FLOW_DRAFT_ROW_FIELD } from "../../flow-draft/index.ts";
import { authoringNestedValue, authoringParameterValue } from "./values.ts";

/** What a value written as a binding can name: this block's labelled steps by node key, whether a label is another block's, and a part's inputs. */
export type AuthoringScriptBindingScope = {
  labelKeys: ReadonlyMap<string, string>;
  elsewhere(label: string): boolean;
  /** In a part: the inputs it declares, which are all `$input` may name there, with no test value needed (C1: nothing else crosses in). */
  partInputs?: ReadonlySet<string> | undefined;
};

/** A row's field, as the draft's own `{"$row": ...}` form names it (`../../flow-draft/binding-forms.ts`). */
const ROW_FORM = /^\$row\.(.*)$/u;
/** A Flow input with the value the build tests it with, as the draft's `{"$input": ..., "test": ...}` form names one. */
const INPUT_FORM = /^\$input\.([^\s=]*)\s*(?:=\s*([\s\S]*))?$/u;
/** An earlier step's output: `$step.<label>.<output>[.<field>]`. */
const STEP_FORM = /^\$step\.(.+)$/u;
const OUTPUT_ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/u;
/** The name a pass's row goes by in run state, so no input may take it. */
const ROW_NAME = "item";

/**
 * A written value read as the binding it names, the reason it cannot be one,
 * or nothing when it names none.
 *
 * Each form stores exactly what the drafted path stores for the same intent,
 * so the plan is the same graph either way and the one checker reads both
 * (`./draft-bindings.ts`, `./assemble-draft.ts`):
 *
 *   `$row.<field>`               `{"$state":{"path":"item.<field>"}}`, the field of the row a pass is on
 *   `$input.<name> = <test>`     `{"$state":{"path":"<name>","fallback":<test>}}`, a Flow input and its test value
 *   `$step.<label>.<output>...`  `{"$state":{"path":"$node.<key>.<output>..."}}`, an earlier step's output,
 *                                by the key the labelled step's node has
 *
 * Names follow the draft's rules (`AUTOMATION_STUDIO_FLOW_DRAFT_ROW_FIELD`,
 * `AUTOMATION_STUDIO_FLOW_DRAFT_INPUT_NAME`). Whether the graph can honour a
 * binding -- a row outside a loop, an output read before it exists -- is the
 * checker's question once the plan exists, never this reader's.
 */
export function automationStudioScriptBinding(text: string, parameter: AutomationNodeParameter | undefined, scope: AuthoringScriptBindingScope): { value: JsonValue } | { refused: string } | undefined {
  const written = text.trim();
  if (!written.startsWith("$")) return undefined;
  const row = ROW_FORM.exec(written);
  if (row) {
    const field = row[1] ?? "";
    return AUTOMATION_STUDIO_FLOW_DRAFT_ROW_FIELD.test(field)
      ? { value: automationStudioStateBinding(`${ROW_NAME}.${field}`) }
      : { refused: `"$row.${field.slice(0, 64)}" names no field: a row's field is one name with no dot or space, \`$row.<field>\`, one of the fields the listing reads.` };
  }
  const input = INPUT_FORM.exec(written);
  if (input) {
    const name = input[1] ?? "";
    const test = input[2]?.trim();
    if (!AUTOMATION_STUDIO_FLOW_DRAFT_INPUT_NAME.test(name) || name === ROW_NAME) {
      return { refused: `"$input.${name.slice(0, 32)}" is not a Flow input's name: it starts with a lower-case letter, holds only letters and digits, at most 32, and is never "${ROW_NAME}".` };
    }
    if (scope.partInputs) {
      if (!scope.partInputs.has(name)) return { refused: `"$input.${name}" is not an input of this part. A part sees only what its caller gives it: declare it with \`input: ${name}\` on the part, and give it on the step that calls the part.` };
      return { value: automationStudioStateBinding(name, test === undefined || !test ? undefined : parameter ? authoringParameterValue(test, parameter) ?? test : authoringNestedValue(test)) };
    }
    if (!test) return { refused: `"$input.${name}" gives no test value: write \`$input.${name} = <the value the person gave>\`, which the build tests with and a run uses when it is given none.` };
    return { value: automationStudioStateBinding(name, parameter ? authoringParameterValue(test, parameter) ?? test : authoringNestedValue(test)) };
  }
  const step = STEP_FORM.exec(written);
  if (!step) return undefined;
  const rest = step[1] ?? "";
  const lowered = rest.toLowerCase();
  const label = [...scope.labelKeys.keys()].filter((candidate) => lowered.startsWith(`${candidate}.`)).sort((a, b) => b.length - a.length)[0];
  if (label === undefined) {
    const other = lowered.split(".")[0] ?? "";
    return { refused: scope.elsewhere(other)
      ? `"$step.${other}" names a step in another block; a step reads the output of an earlier step in its own block.`
      : `"$step.${rest.slice(0, 64)}" names no labelled step of this block: write \`$step.<label>.<output>\`, with the label of an earlier step and an output its node declares.` };
  }
  const [output, ...fields] = rest.slice(label.length + 1).split(".");
  if (!output || !OUTPUT_ID.test(output) || fields.some((field) => !field)) {
    return { refused: `"$step.${rest.slice(0, 64)}" names no output: write \`$step.${label}.<output>\`, or \`$step.${label}.<output>.<field>\`, with an output that step's node declares.` };
  }
  return { value: automationStudioStateBinding([AUTOMATION_NODE_OUTPUT_REFERENCE_ROOT, scope.labelKeys.get(label)!, output, ...fields].join(".")) };
}

/** A state binding as the executor reads one (`nodes/parameter-bindings.ts`). */
export function automationStudioStateBinding(path: string, fallback?: JsonValue): JsonObject {
  return { $state: { path, ...(fallback === undefined ? {} : { fallback }) } };
}
