import { automationStudioActivityReasonText } from "./reason-text.ts";

/**
 * Why a written Flow was refused, said from its issues' own codes rather than
 * from the refusal's family (t378, lane B). A refusal's family is broad:
 * `parameters_unresolved` read "{some} steps point at things that weren't seen
 * on the page" for a search step that sent its form without saying what
 * sending does (`web.step.consequences_undeclared`). Each issue code a person
 * can be told about has its own words here, once for one step and once for
 * several; a code with none says nothing, and the caller falls back to the
 * family's words (`./completion-refusal.ts`).
 *
 * How many steps are to be fixed is counted by place, not by issue: one step
 * refused for two reasons is one step ("4 things to fix" was 2 steps). A place
 * is the issue's script `line`, else the node its `path` names
 * (`plan.subflows.0.nodes.13.parameters` is node 13), else the script line its
 * path names (`flow.line.22`), else the path itself; an issue with no path is
 * a place of its own.
 */

/**
 * `many` says `{some}` where the number of steps goes: "some", or the number
 * itself when the caller counts. `named` and `namedMany` say the same of steps
 * the issues name in the model's own words (`{step}`, `{steps}`).
 */
type Words = { one: string; many: string; named: string; namedMany: string };

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

/** First match wins. A code is read without what follows its `:` (`web.handle.unknown_field:extractList.fields.0`). */
const BY_CODE: ReadonlyArray<readonly [RegExp, Words]> = [
  [/^web\.step\.(?:consequences_undeclared|expected\.consequences)|^bootstrap\.(?:step_consequences_invalid|invalid_consequences)$/u,
    { one: "a step that presses or sends something didn't say what doing that does", many: "{some} steps that press or send something didn't say what doing that does",
      named: "the step {step} presses or sends something but didn't say what doing that does", namedMany: "the steps {steps} press or send something but didn't say what doing that does" }],
  [/^flow_script\.repeat_/u, { one: "a repeat was written where the Flow can't run it", many: "{some} repeats were written where the Flow can't run them",
    named: "the repeat on the step {step} was written where the Flow can't run it", namedMany: "the repeats on the steps {steps} were written where the Flow can't run them" }],
  [/^(?:web|bootstrap)\.handle[._]/u, { one: "a step points at something that wasn't seen on the page", many: "{some} steps point at things that weren't seen on the page",
    named: "the step {step} points at something that wasn't seen on the page", namedMany: "the steps {steps} point at things that weren't seen on the page" }],
  [/^bootstrap\.required_input_unconnected$/u, { one: "a step wasn't given what it works on from an earlier step", many: "{some} steps weren't given what they work on from earlier steps",
    named: "the step {step} wasn't given what it works on from an earlier step", namedMany: "the steps {steps} weren't given what they work on from earlier steps" }],
  [/^bootstrap\.(?:invalid_parameter_value|parameter_contract_violation|parameter_contract_failed)$/u, { one: "a step was given a setting it can't use", many: "{some} steps were given settings they can't use",
    named: "the step {step} was given a setting it can't use", namedMany: "the steps {steps} were given settings they can't use" }],
  [/^bootstrap\.unknown_parameter$/u, { one: "a step was given a setting it doesn't take", many: "{some} steps were given settings they don't take",
    named: "the step {step} was given a setting it doesn't take", namedMany: "the steps {steps} were given settings they don't take" }],
  [/^bootstrap\.missing_parameter$/u, { one: "a step is missing a setting it needs", many: "{some} steps are missing a setting they need",
    named: "the step {step} is missing a setting it needs", namedMany: "the steps {steps} are missing a setting they need" }]
];

/**
 * One issue as a refusal's feedback carries it: its code, where it is, as far
 * as it says, and `step`, the step's description as the model wrote it
 * (`flow-bootstrap/authoring/locate-issue.ts`, t378).
 */
export type AutomationStudioActivityIssue = { code: string; path?: string | undefined; line?: number | undefined; step?: string | undefined };

/** The most steps a reason names by their words; more are counted instead. */
const MAX_NAMED = 2;
/** The most characters of one step's words quoted. */
const STEP_WORDS = 80;

/**
 * A step's own words as a person may read them, in quotes, or nothing: held to
 * `STEP_WORDS` and screened as the model's reasons are (handles, node ids and
 * codes left out, `./reason-text.ts`), never with its line number or code.
 */
function quoted(step: string | undefined): string | undefined {
  const words = automationStudioActivityReasonText(step, STEP_WORDS)?.replace(/[.!?]+$/u, "").trim();
  return words ? `'${words}'` : undefined;
}

const NODE_PATH = /^(.*?\.nodes\.[^.]+)/u;
const SCRIPT_LINE = /^flow\.line\.(\d+)/u;

/** Where an issue is: a step (its script line, or the node its path names), or, failing that, its path, or the issue alone. */
function placeOf(issue: AutomationStudioActivityIssue, index: number): { key: string; step: boolean } {
  if (typeof issue.line === "number" && Number.isSafeInteger(issue.line)) return { key: `line ${issue.line}`, step: true };
  const path = issue.path ?? "";
  const node = NODE_PATH.exec(path)?.[1];
  if (node) return { key: node, step: true };
  const line = SCRIPT_LINE.exec(path)?.[1];
  if (line) return { key: `line ${line}`, step: true };
  return { key: path || `${issue.code} #${index}`, step: false };
}

/**
 * The plain reasons `issues` give, once each (one step or several, by how many
 * places each reason is about), how many distinct steps they name, and how
 * many issues name no step. No code, path or line number is ever in the words.
 * `counted` says how many steps each reason is about ("two steps that ...")
 * where it would otherwise say "some", for a sentence that gives no count
 * after it (a build's ending, `../../conversations/commands/progress.ts`).
 * `named` says each step by its own words where every step of a reason has
 * them and there are at most two ("the step 'keep requests with 5 or more
 * mutual friends' was given a setting it doesn't take", t378 lane D); a step
 * with no words, or a third, is counted as before.
 */
export function automationStudioActivityIssueWords(issues: readonly AutomationStudioActivityIssue[], counted = false, named = false): { reasons: string[]; steps: number; others: number } {
  const placesByReason = new Map<Words, Set<string>>();
  /** Each step place's words, from the first of its issues that has any. */
  const wordsByPlace = new Map<string, string>();
  const steps = new Set<string>();
  const others = new Set<string>();
  for (const [index, issue] of issues.entries()) {
    const place = placeOf(issue, index);
    (place.step ? steps : others).add(place.key);
    const words = BY_CODE.find(([pattern]) => pattern.test(issue.code.split(":")[0]!))?.[1];
    if (words) placesByReason.set(words, (placesByReason.get(words) ?? new Set()).add(place.key));
    const said = named && place.step && !wordsByPlace.has(place.key) ? quoted(issue.step) : undefined;
    if (said) wordsByPlace.set(place.key, said);
  }
  const some = (count: number): string => (counted ? NUMBER_WORDS[count] ?? String(count) : "some");
  const reasons = [...placesByReason].map(([words, at]) => {
    const names = [...at].map((key) => wordsByPlace.get(key));
    const all = names.every((name): name is string => name !== undefined) ? names as string[] : undefined;
    if (all && all.length === 1) return words.named.replace("{step}", all[0]!);
    if (all && all.length > 1 && all.length <= MAX_NAMED) return words.namedMany.replace("{steps}", all.join(" and "));
    return at.size > 1 ? words.many.replace("{some}", some(at.size)) : words.one;
  });
  return { reasons, steps: steps.size, others: others.size };
}
