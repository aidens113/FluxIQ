// The shorter forms of a finished run's or a trial's summary, for a request that does not fit the judging model's
// window (t963, J1): the harness sends the first that fits, and the whole summary wherever it fits
// (`../../llm/harness/sized-request.ts`). The Flow-less judge has its own (`../flow-less/window-fitting.ts`), which
// keeps the same order.
//
// **The trail and the final data last.** The views of the site at its start and its end go first; then what each
// trail step found, oldest first; then what each was asked. The rows, the reads' accounts and every step's outcome
// are never summarised here. A summarised item stays in its own place as `core.summarised`, saying what it held in
// counts and never its content, and `summarised` names them all, so a shortened picture never reads as a whole one.

import type { JsonObject, JsonValue } from "../../../core/index.ts";
import type { AutomationStudioRunResultSummary } from "../contracts/index.ts";

const SUMMARISED_KEY = "core.summarised";

type Item = { item: string; path: readonly (string | number)[] };

/** The summary told more briefly, one more item summarised at each step: the shortest last. Empty where nothing can be. */
export function automationStudioResultTrailFitting(summary: AutomationStudioRunResultSummary): AutomationStudioRunResultSummary[] {
  // The semantic format already omits captures. Its exact facts, rows and
  // accounts must not be traded for labels/counts to fit a provider window.
  if (summary.evidenceProjection?.version === 1) return [];
  const whole = summary as unknown as JsonObject;
  const forms: AutomationStudioRunResultSummary[] = [];
  const items: string[] = [];
  let current = whole;
  for (const step of order(summary)) {
    const original = at(whole, step.path);
    if (original === undefined) continue;
    const placeholder: JsonObject = { [SUMMARISED_KEY]: { item: step.item, characters: JSON.stringify(original).length, ...counted(original) } };
    if (JSON.stringify(placeholder).length >= JSON.stringify(original).length) continue;
    current = setAt(current, step.path, placeholder);
    items.push(step.item);
    forms.push({ ...current, summarised: told(items) } as unknown as AutomationStudioRunResultSummary);
  }
  return forms;
}

function order(summary: AutomationStudioRunResultSummary): Item[] {
  const entries = summary.trail?.entries ?? [];
  return [
    { item: "startView.view", path: ["startView", "view"] },
    { item: "endView.view", path: ["endView", "view"] },
    ...entries.map((_, index) => ({ item: `trail.entries[${index}].found`, path: ["trail", "entries", index, "found"] })),
    ...entries.map((_, index) => ({ item: `trail.entries[${index}].asked`, path: ["trail", "entries", index, "asked"] }))
  ];
}

/** What summarising `items` means, in Core's words. Generic: no site, task or product is named. */
function told(items: readonly string[]): JsonObject {
  return {
    count: items.length,
    items: [...items],
    note: `This request did not fit the context window of the model judging it, so Core summarised ${items.length} of the evidence ${items.length === 1 ? "item" : "items"} listed here instead of showing ${items.length === 1 ? "it" : "them"} whole, the views of the site first and then what the earliest entries of the trail found. Each one is shown in its own place as ${SUMMARISED_KEY}, saying what it held in counts and never its content. Everything else is shown whole, the rows and every entry's outcome included. Judge on what is shown whole: where a part of the request can be settled only from a summarised item, say which.`
  };
}

function counted(value: JsonValue): JsonObject {
  if (Array.isArray(value)) return { kind: "list", entries: value.length };
  if (typeof value === "string") return { kind: "text" };
  if (value !== null && typeof value === "object") return { kind: "object", keys: Object.keys(value) };
  return { kind: value === null ? "null" : typeof value };
}

function at(value: JsonValue, path: readonly (string | number)[]): JsonValue | undefined {
  let here: JsonValue | undefined = value;
  for (const key of path) {
    if (typeof key === "number") here = Array.isArray(here) ? here[key] : undefined;
    else here = here !== null && typeof here === "object" && !Array.isArray(here) ? here[key] : undefined;
    if (here === undefined) return undefined;
  }
  return here;
}

function setAt(value: JsonObject, path: readonly (string | number)[], replacement: JsonValue): JsonObject {
  const put = (here: JsonValue, depth: number): JsonValue => {
    if (depth === path.length) return replacement;
    const key = path[depth]!;
    if (typeof key === "number" && Array.isArray(here)) return here.map((entry, index) => (index === key ? put(entry, depth + 1) : entry));
    if (typeof key === "string" && here !== null && typeof here === "object" && !Array.isArray(here)) return { ...here, [key]: put(here[key]!, depth + 1) };
    return here;
  };
  return put(value, 0) as JsonObject;
}
