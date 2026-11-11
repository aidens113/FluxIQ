// What the Flow-less judge is sent when what an attempt got does not fit the judging
// model's context window (W3, t899).
//
// A run may judge on a model of its own (`../../llm/role-routing/`), and the request is
// built to that model's window (`../../llm/harness/sized-request.ts`). Where the whole
// summary fits, it is sent whole and nothing here is read. Where it does not, it was
// refused by size and the check came back "not judged". Nothing is dropped and nothing
// is cut to a count instead (user: "Remove ANY AND ALL LIMITS ON THE NUMBER OF ELEMENTS
// PASSED TO MODEL. DO NOT HIDE INFORMATION."). Evidence items are summarised in Core's
// words, one more at a time, until the request fits. That is what an attempt does with
// what it holds when its own request outgrows its window: a fresh round is told Core's
// account of the acts and rows kept, never the pages again
// (`SVC/answer-first/attempt/round-note.ts`).
//
// **Each shorter form says what it summarised.** A summarised item stays in its own
// place as `core.summarised`, saying what it held in counts (entries, keys, characters)
// and never its content. `summarised`, last in the summary, names every item summarised,
// how many there are, and what that means for a yes. So the judge is never shown a
// shortened picture that reads as a whole one.
//
// **Which items go first.** The views of the site go first, as the largest and the
// furthest from the result itself, and the rows held go last. The rows are first
// summarised to their labels and only then to counts. An item whose account would be no
// shorter than the item itself is left whole.

import type { JsonObject, JsonValue } from "../../../core/index.ts";
import type { AutomationStudioRunResultSummary } from "../contracts/index.ts";

/** The key a summarised item is shown under, in its own place. */
const SUMMARISED_KEY = "core.summarised";

type Step = { item: string; path: readonly (string | number)[]; account: (value: JsonValue) => JsonObject };

/** The summary told more briefly, one more item summarised at each step: the shortest last. Empty where nothing can be summarised. */
export function automationStudioFlowLessSummaryFitting(sent: AutomationStudioRunResultSummary): AutomationStudioRunResultSummary[] {
  const whole = sent as unknown as JsonObject;
  const forms: AutomationStudioRunResultSummary[] = [];
  const items: string[] = [];
  let current = whole;
  for (const step of steps(whole)) {
    const original = at(whole, step.path);
    const shown = at(current, step.path);
    if (original === undefined || shown === undefined) continue;
    const placeholder: JsonObject = { [SUMMARISED_KEY]: { item: step.item, characters: JSON.stringify(original).length, ...step.account(original) } };
    if (JSON.stringify(placeholder).length >= JSON.stringify(shown).length) continue;
    current = setAt(current, step.path, placeholder);
    if (!items.includes(step.item)) items.push(step.item);
    forms.push({ ...current, summarised: told(items) } as unknown as AutomationStudioRunResultSummary);
  }
  return forms;
}

/** Every step there is for `summary`, in order. */
function steps(summary: JsonObject): Step[] {
  const sets = Array.isArray(summary.recordSets) ? summary.recordSets : [];
  const rows = sets.flatMap((set, index): Step[] => {
    if (!isObject(set) || !Array.isArray(set.sampleRows)) return [];
    const columns = Array.isArray(set.columns) ? set.columns.filter((column): column is string => typeof column === "string") : [];
    const item = `recordSets[${index}].sampleRows`;
    const path = ["recordSets", index, "sampleRows"];
    return [
      { item, path, account: (value) => rowsAccount(value, columns, true) },
      { item, path, account: (value) => rowsAccount(value, columns, false) }
    ];
  });
  return [
    { item: "witnesses.before", path: ["witnesses", "before"], account },
    { item: "witnesses.after", path: ["witnesses", "after"], account },
    { item: "endView.view", path: ["endView", "view"], account },
    { item: "looked", path: ["looked"], account },
    { item: "readPages", path: ["readPages"], account },
    { item: "acts", path: ["acts"], account },
    { item: "answerText.text", path: ["answerText", "text"], account },
    ...rows
  ];
}

/** What `items` being summarised means, in Core's words. Generic: no site, task or product is named. */
function told(items: readonly string[]): JsonObject {
  return {
    count: items.length,
    items: [...items],
    note: `This request did not fit the context window of the model judging it, so Core summarised ${items.length} of the evidence ${items.length === 1 ? "item" : "items"} listed here instead of showing ${items.length === 1 ? "it" : "them"} whole. Each one is shown in its own place as ${SUMMARISED_KEY}, saying what it held in counts (entries, keys, characters) and never its content. Everything else is shown whole. A yes must stand on what is shown whole: where what was asked for can only be settled from a summarised item, answer unknown.`
  };
}

/** What a value held, in counts and kinds: its entries, its keys and what each holds, or its characters. A number, a flag or a null is said as it is. */
function account(value: JsonValue): JsonObject {
  if (Array.isArray(value)) return { kind: "list", entries: value.length };
  if (typeof value === "string") return { kind: "text", characters: [...value].length };
  if (isObject(value)) return { kind: "object", keys: Object.fromEntries(Object.entries(value).map(([key, member]) => [key, brief(member)])) };
  return { kind: value === null ? "null" : typeof value, value };
}

/** One member of an object, in a few words. */
function brief(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return `list of ${value.length} ${value.length === 1 ? "entry" : "entries"}`;
  if (typeof value === "string") return `text of ${[...value].length} characters`;
  if (isObject(value)) return `object of ${Object.keys(value).length} keys`;
  return value;
}

/** The rows held, by count and columns, and each by its label (its value in the first column) where `labelled`. */
function rowsAccount(value: JsonValue, columns: readonly string[], labelled: boolean): JsonObject {
  const rows = Array.isArray(value) ? value : [];
  const first = columns[0];
  const labels = labelled && first !== undefined ? rows.map((row) => (isObject(row) && (typeof row[first] === "string" || typeof row[first] === "number") ? row[first]! : null)) : undefined;
  return { kind: "rows", rows: rows.length, columns: [...columns], ...(labels ? { labelColumn: first!, labels } : {}) };
}

function at(value: JsonValue, path: readonly (string | number)[]): JsonValue | undefined {
  let here: JsonValue | undefined = value;
  for (const key of path) {
    if (typeof key === "number") here = Array.isArray(here) ? here[key] : undefined;
    else here = isObject(here) ? here[key] : undefined;
    if (here === undefined) return undefined;
  }
  return here;
}

/** `value` with `replacement` at `path`, sharing everything off the path. */
function setAt(value: JsonObject, path: readonly (string | number)[], replacement: JsonValue): JsonObject {
  const put = (here: JsonValue, depth: number): JsonValue => {
    if (depth === path.length) return replacement;
    const key = path[depth]!;
    if (typeof key === "number" && Array.isArray(here)) return here.map((entry, index) => (index === key ? put(entry, depth + 1) : entry));
    if (typeof key === "string" && isObject(here)) return { ...here, [key]: put(here[key]!, depth + 1) };
    return here;
  };
  return put(value, 0) as JsonObject;
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
