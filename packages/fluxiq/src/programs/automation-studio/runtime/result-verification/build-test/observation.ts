// What the judge of a build's test is sent of each step's observation, and
// what it is not (t195-w28a).
//
// **What the request weighed.** Run 36's Flow, eleven steps with the test's
// observations taken from the run's own tool results
// (`./tests/run-36-test.json`), made a judge's request of 28,214 characters,
// 26,666 of them `buildTest`. 17,816 were six whole page views, one inside
// every observation that was sent: a read's, and each checked Confirm's. The
// verdict reads none of them. It reads a step's own words, its outcome, the
// rows a read returned and a check's answer (`llm/diagnosis-instructions.ts`).
// A page view is where the step left the target, which the evidence loop
// already sends only once per decision (`llm/context-window.ts`); it is not
// what the step did.
//
// **What is taken out, and why each is safe.**
//
//   - The view: the top-level keys the domain declared as a view of its
//     target (`observedStateKeys`, as the context window reads them). Core
//     knows nothing about pages; the domain says which keys are one.
//   - Core's own bookkeeping, outside any list: `schemaVersion`, an id key
//     holding a UUID (a command's id), and a key ending `At` holding an epoch
//     time in milliseconds. No sentence of the verdict reads a version, a
//     command id or a clock.
//   - A string that only repeats the step's action, which `action` already says.
//   - Text another step's observation already sent, forty characters or more,
//     outside any list: it is written `as step <n>` instead, so nothing is
//     lost -- the same note under two reads, the same address under every step
//     on one page.
//
// **What is never touched.** Anything inside a list. That is where the rows a
// read returned live, and two rows may hold the same value; a row's value is
// the answer the judge exists to read. Every other key -- a read's validation,
// its counts, its conditions, a check's answer, the status, the control -- is
// kept as the domain wrote it.
//
// **A changing step run again** (t193 1003, w3) is read with its outcome's
// codes and its own words (`changing`). Only an answer that says what the step
// changed or what the page answered (`changed`, `notice`) is sent -- what the
// judge of run `run-musp4h2f-72e8ed99` needed for its "+" and never saw -- and
// without its top-level `ok`, `said`, and a `code` the outcome already gave,
// which only restate that it ran. Any other answer, a bare "ran again" or a
// whole tool result (run 36's clicks), is not sent: it says nothing the
// outcome does not. Its `changed` lines are bounded first, the lines about its
// own control and a value it set ahead of the rest (`./change-lines.ts`,
// t174-w106); the whole answer is then screened like any other observation.
//
// A replayed list read's `readRows` (t194 w55) are made labels before any of
// that, by the screen the runtime judge's rows pass (`./read-rows.ts`): a
// withheld label is said as withheld rather than costing the observation.
//
// Screening then runs on what is left as before: no denied key, no
// locator-shaped key or text, and nothing credential-shaped.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import {
  automationStudioEvidenceKey,
  automationStudioLocatorShapedText,
  automationStudioWithoutLocators,
  screenAutomationStudioLlmEvidence
} from "../../llm/index.ts";
import { AUTOMATION_STUDIO_BUILD_TEST_CHANGE_LINES_KEY, automationStudioBuildTestChangeLines } from "./change-lines.ts";
import { automationStudioBuildTestReadRows } from "./read-rows.ts";

/** One step's observations made sendable: `withheld` when screening took anything out. */
export type AutomationStudioBuildTestObservationReader = (
  step: { position: number; actionId: string },
  evidence: readonly JsonValue[],
  /**
   * Given for a changing step run again: the outcome's result codes, which its
   * answer's `code` only restates, and the step's own words, whose change
   * lines lead.
   */
  changing?: { restating: ReadonlySet<string>; words: readonly string[] }
) => { value?: JsonValue; withheld: boolean };

/** Shortest text worth replacing with the step that already sent it. */
const REPEATED_TEXT_MIN = 40;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/**
 * A reader for one judge's request, called for each step in order: it
 * remembers the text earlier steps sent, so a later one can name it rather than
 * send it again.
 */
export function automationStudioBuildTestObservationReader(input: {
  deniedEvidenceKeys: readonly string[];
  /** The domain's declared view keys; absent or empty, no view is recognised. */
  observedStateKeys?: readonly string[] | undefined;
}): AutomationStudioBuildTestObservationReader {
  const denied = new Set(input.deniedEvidenceKeys.map(automationStudioEvidenceKey));
  const viewKeys = new Set(input.observedStateKeys ?? []);
  const sent = new Map<string, number>();
  return (step, evidence, changing) => {
    let linesWithheld = false;
    const answers = evidence.map((item) => withoutView(item, viewKeys)).flatMap((item) => {
      if (!changing) return [item];
      const answer = changeAnswer(item, changing);
      if (answer.withheld) linesWithheld = true;
      return answer.value === undefined ? [] : [answer.value];
    });
    if (!answers.length) return { withheld: linesWithheld };
    // A replayed read's rows are made screened labels first (`./read-rows.ts`), so one label costs that label, not the observation.
    const rows = answers.map((item) => automationStudioBuildTestReadRows(item, input.deniedEvidenceKeys));
    const lean = rows.map((item) => withoutBookkeeping(item.value, step.actionId));
    const value = lean.length === 1 ? lean[0]! : lean;
    const kept = automationStudioWithoutLocators(withoutKeys(value, denied));
    if (screenAutomationStudioLlmEvidence(kept, []).secretShaped) return { withheld: true };
    const withheld = linesWithheld || rows.some((item) => item.withheld) || JSON.stringify(kept) !== JSON.stringify(value);
    return { value: namingRepeats(kept, step.position, sent), withheld };
  };
}

/** The observation without the domain's view keys, at the top level only, as the context window takes them. */
function withoutView(value: JsonValue, viewKeys: ReadonlySet<string>): JsonValue {
  if (!viewKeys.size || !isObject(value)) return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !viewKeys.has(key)));
}

/**
 * A changing step's answer that says what it changed or what the page
 * answered, its change lines bounded (`./change-lines.ts`) and without the
 * top-level keys that only restate its outcome; else nothing.
 */
function changeAnswer(value: JsonValue, changing: { restating: ReadonlySet<string>; words: readonly string[] }): { value?: JsonValue; withheld: boolean } {
  const key = AUTOMATION_STUDIO_BUILD_TEST_CHANGE_LINES_KEY;
  if (!isObject(value) || (value[key] === undefined && value.notice === undefined)) return { withheld: false };
  const lines = value[key] === undefined ? undefined : automationStudioBuildTestChangeLines(value[key], changing.words);
  const withheld = lines?.withheld ?? false;
  // An answer whose only news was change lines, none of them sendable, says nothing the outcome does not.
  if (lines && !lines.value && value.notice === undefined) return { withheld };
  const left = Object.entries(value).flatMap(([name, item]): Array<[string, JsonValue]> => {
    if (name === "ok" || name === "said" || (name === "code" && typeof item === "string" && changing.restating.has(item))) return [];
    if (name !== key) return [[name, item as JsonValue]];
    return lines?.value ? Object.entries(lines.value) : [];
  });
  return left.length ? { value: Object.fromEntries(left), withheld } : { withheld };
}

/** Core's bookkeeping and the step's own action, outside any list. */
function withoutBookkeeping(value: JsonValue, action: string): JsonValue {
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key, item]) => !bookkeeping(key, item) && item !== action)
    .map(([key, item]) => [key, withoutBookkeeping(item as JsonValue, action)]));
}

function bookkeeping(key: string, value: unknown): boolean {
  if (key === "schemaVersion") return true;
  if (/id$/iu.test(key) && typeof value === "string" && UUID.test(value)) return true;
  return /[a-z]At$/u.test(key) && typeof value === "number" && Number.isInteger(value) && value >= 1e12 && value < 1e14;
}

/** Text an earlier step already sent, named by that step; recorded as it is first sent. Never inside a list. */
function namingRepeats(value: JsonValue, step: number, sent: Map<string, number>): JsonValue {
  if (typeof value === "string") {
    if (value.length < REPEATED_TEXT_MIN) return value;
    const first = sent.get(value);
    if (first !== undefined && first !== step) return `as step ${first}`;
    if (first === undefined) sent.set(value, step);
    return value;
  }
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, namingRepeats(item as JsonValue, step, sent)]));
}

function withoutKeys(value: JsonValue, denied: ReadonlySet<string>): JsonValue {
  if (Array.isArray(value)) return value.map((item) => withoutKeys(item, denied));
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !denied.has(automationStudioEvidenceKey(key)) && !automationStudioLocatorShapedText(key))
    .map(([key, item]) => [key, withoutKeys(item as JsonValue, denied)]));
}

function isObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
