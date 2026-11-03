// A submission that no longer has a step choosing the request's own words
// before the read, and tests those words nowhere else (t666).
//
// **Why.** A8 frozen pair 8 candidate towels `run-mvam0lys-2d3eb090`: a step
// chose, in a named group the page showed, an option the request names in its
// own words. A no misread it as keeping less than the request asks, Core could
// not refute that (it never saw the rows the step removed), and the next
// revision dropped the step. No other step or condition read that part of the
// request again, and every later trial was judged on rows that only the site's
// own layout kept right.
//
// **What Core says, and only that.** The trial the controller already asks the
// gate about (`trialOf`, the latest accepted revision's that has one) carries
// each read's steps before it (`feedback.reads[].narrowedBefore`, t655): the
// group a step chose in and the option it chose. Where that option's words
// pass the request-text test (`../refuted-no/request-text-test.ts`), the step
// is found as the revision that ran wrote it (`./written-conditions.ts`), and a
// submitted plan that has no step with the same parameters, and no condition
// under any `where` list testing those words, is answered with Core's words:
// the step, as written, the option it chose, and the request's words it is.
// Core does not say the step was right -- it did not see what it removed --
// only that nothing left in the Flow reads those words. The submission
// controller gives this hint once per step and trial; the same submission sent
// again is accepted. A hint, never a block.
//
// It reads a trial's model-facing feedback, any value a port answered (one not
// of the shape is none), and plans. Generic words, naming no site or task.

import { automationStudioResultRequestTextTest } from "../refuted-no/index.ts";
import { automationStudioRequestRowWords } from "../request-rows/index.ts";
import type { AutomationStudioResultKeptStep, AutomationStudioResultKeptStepDrop } from "./types.ts";
import { automationStudioResultWrittenStep, automationStudioResultWrittenSteps, type AutomationStudioResultConditionPlan } from "./written-conditions.ts";

/**
 * The steps of the trial (`trial`, a gate's kept result for the revision
 * `revision`, whose plan was `ran`) that chose the request's own words, which
 * `plan` no longer has and tests nowhere, less those whose written form
 * `refused` holds; nothing where none. `subject` is what the loop calls what it
 * submits ("Flow", "subflow").
 */
export function automationStudioResultKeptStepsDropped(input: {
  trial: unknown;
  revision: number;
  ran: AutomationStudioResultConditionPlan | undefined;
  plan: AutomationStudioResultConditionPlan | undefined;
  requestText: string | undefined;
  refused?: ReadonlySet<string> | undefined;
  subject?: string | undefined;
}): AutomationStudioResultKeptStepDrop | undefined {
  const { requestText } = input;
  if (!input.ran || !input.plan || !requestText?.trim()) return undefined;
  const says = saidBy(requestText);
  const steps = new Map<string, AutomationStudioResultKeptStep>();
  for (const step of narrowingSteps(input.trial)) {
    if (steps.has(step.nodeId)) continue;
    // The option is tested as a positive text test of its words, as `../unsure-doubts/narrowing.ts` tests it.
    const texts = automationStudioResultRequestTextTest(`option contains ${JSON.stringify(step.chose)}`, requestText, says);
    const written = texts ? automationStudioResultWrittenStep(input.ran, step.nodeId) : undefined;
    if (texts && written !== undefined) steps.set(step.nodeId, { ...step, texts, revision: input.revision, written });
  }
  if (!steps.size) return undefined;
  const writtenNow = automationStudioResultWrittenSteps(input.plan);
  const tested = conditionTexts(input.plan);
  const dropped = [...steps.values()].filter((step) => !writtenNow.has(step.written) && !input.refused?.has(step.written)
    && !step.texts.every((text) => tested.some((value) => value.includes(fold(text)))));
  return dropped.length ? { dropped, said: said(dropped, input.subject ?? "Flow") } : undefined;
}

/** Each step before a read that chose an option of a named group, as a trial's feedback gives it; none from anything else. */
function narrowingSteps(trial: unknown): Array<Pick<AutomationStudioResultKeptStep, "nodeId" | "label" | "group" | "chose">> {
  const feedback = isRecord(trial) ? trial.feedback : undefined;
  const reads = isRecord(feedback) && Array.isArray(feedback.reads) ? feedback.reads : [];
  return reads.flatMap((read) => (isRecord(read) && Array.isArray(read.narrowedBefore) ? read.narrowedBefore : [])).flatMap((step) => {
    if (!isRecord(step) || typeof step.nodeId !== "string" || typeof step.group !== "string" || typeof step.chose !== "string" || !step.group.trim() || !step.chose.trim()) return [];
    return [{ nodeId: step.nodeId, ...(typeof step.label === "string" && step.label.trim() ? { label: step.label } : {}), group: step.group, chose: step.chose }];
  });
}

/** Every text value under any `where` list of the plan's steps, folded: what a condition tests. */
function conditionTexts(plan: AutomationStudioResultConditionPlan): string[] {
  const texts: string[] = [];
  const collect = (value: unknown): void => {
    if (typeof value === "string") texts.push(fold(value));
    else if (Array.isArray(value)) value.forEach(collect);
    else if (isRecord(value)) Object.values(value).forEach(collect);
  };
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (isRecord(value)) for (const [key, entry] of Object.entries(value)) (key === "where" ? collect : visit)(entry);
  };
  for (const subflow of plan.subflows) for (const node of subflow.nodes) visit(node.parameters);
  return texts;
}

/** Whether a text's words run, word for word, in the request (`../request-rows/request-wording.ts`, `says`). */
function saidBy(requestText: string): (text: string) => boolean {
  const words = automationStudioRequestRowWords(requestText).map((word) => word.word);
  return (text) => {
    const run = automationStudioRequestRowWords(text).map((word) => word.word);
    if (!run.length) return false;
    for (let start = 0; start + run.length <= words.length; start += 1) if (run.every((word, index) => words[start + index] === word)) return true;
    return false;
  };
}

/** Core's words (header): each step, as written, what it chose and the request's words it is, then the way on. */
function said(dropped: readonly AutomationStudioResultKeptStep[], subject: string): string {
  const one = dropped.length === 1;
  const it = one ? "it" : "them";
  const each = dropped.map((step) => `${step.label ? `Step "${step.label}" (${step.nodeId})` : `Step ${step.nodeId}`}, as revision ${step.revision} wrote it (${step.written}), chose "${step.chose}" in "${step.group}", and the request itself says ${step.texts.map((text) => `"${text}"`).join(" and ")}.`).join(" ");
  return `Core's record of this build's trials shows ${one ? "a step" : "steps"} choosing the request's own words before the read, and this ${subject} no longer has ${it} as written, and no condition it writes tests those words, so nothing in it reads that part of the request any more. ${each} `
    + `Core did not see the rows such a step removed, so this is no finding that ${one ? "the step was" : "the steps were"} right, only that the request's words are no longer read. `
    + `Keep ${it} as written, or test those words in a condition, make the other changes you meant, and submit the whole ${subject} again. `
    + `If you mean to drop ${it} anyway, submit the same change again: Core refuses this once, not twice.`;
}

function fold(text: string): string {
  return text.toLowerCase().replace(/\s+/gu, " ").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
