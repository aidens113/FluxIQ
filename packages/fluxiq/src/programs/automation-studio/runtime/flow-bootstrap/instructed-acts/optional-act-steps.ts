// A step that does one of the person's requested acts is never optional, on
// the candidate path as on the draft path (r4b F4).
//
// The draft path holds every step named for an act to `step_is_optional`
// (`./step-fault.ts`), and a completion whose act only an optional step does is
// answered "not complete" (`./optional-only.ts`). A candidate is a Flow script
// with no draft behind it and no act claims, so neither rule ever ran on it:
// R4a (`run-mv4dcf2j-cb68009a`, submit 0038) wrote `optional: yes` on the step
// that collects the store coupon the instruction asked for, and the Flow was
// saved that way. An optional step whose control is not shown is passed over
// as a success (`../../executor/step-skip/absent-step.ts`), so had the coupon
// control been missing the run would have succeeded with the coupon never
// collected.
//
// **Which step does an act.** A script names no act, so the step is read by its
// words: the words of the control its node was resolved to (the identity the
// domain gave it at submission, `automationStudioModelFacingControlWords`),
// else, when that identity carries none, the step's own label and
// description as the model wrote them. The words do an act when they name its
// verb or a word of its kind, or read it done (`./kind-words.ts`). Setting and
// opening are not read: their controls name a value or a place
// (`./claim-doubt.ts`). Words that close, decline or answer a cookie or
// privacy prompt do no act whatever else they name ("Close the coupon
// offer"), so a dismissal stays optional. A step is also read as doing an act
// by its declared `consequences`: a lasting class that one of the instruction's
// acts asks for by its verb (`./act-consequence.ts`). The task parts are not
// reachable where a script is submitted, so that match is on the instruction's
// own acts, never the parts'.
//
// **Conditional is optional too.** A step that runs only on some passes is as
// good as optional for the act it does. `only after: <label>` (t378) runs the
// step only on passes where the optional step it names acted, so on a pass
// where that step finds nothing to press the act is passed over (debug
// `run-mvtdn37t`, step 0048: the act carried `only after:` a dismissal and was
// skipped on every pass); and a step reached only from an optional step's
// `on success:` branch runs only when that step succeeded. Both are refused for
// a step that does a requested act, at the `only after:` line or the branch
// line.
//
// **The part's own lasting act, by class (t796).** Words decide only where
// Core's word lists read the instruction's verb as an act; a request whose verb
// they do not know (a mark, a rating) got no refusal at all, and the act stayed
// conditional. Where the caller knows the consequence classes the task's parts
// ask for (`askedConsequences`, a subflow scope's parts' `lastingActs`), a
// conditional step that declares one of them is refused the same way, unless its
// words close or decline.
//
// The `optional:` refusal is the draft path's sentence (`automationStudioInstructedActOptionalSaid`)
// under the draft path's code (`AUTOMATION_STUDIO_INSTRUCTED_ACT_OPTIONAL_ISSUE_CODE`),
// at the step's `optional:` line, with what to write instead.
import type { AutomationStudioFlowBootstrapIssueLocator, AutomationStudioFlowScript, AutomationStudioFlowScriptStep } from "../authoring/index.ts";
import { automationStudioModelFacingControlWords } from "../../llm/model-facing/index.ts";
import type { AutomationStudioFlowBootstrapIssue, AutomationStudioFlowBootstrapPlan } from "../plan/index.ts";
import { automationStudioFlowScriptStepSaysOptional } from "../script-statements/index.ts";
import type { AutomationStudioInstructedAct } from "./contracts.ts";
import { automationStudioInstructedActs } from "./instruction-acts.ts";
import {
  AUTOMATION_STUDIO_INSTRUCTED_ACT_LASTING_KINDS,
  automationStudioInstructedActWordsDecline,
  automationStudioInstructedActWordsNameAct,
  automationStudioInstructedActWordsShowDone
} from "./kind-words.ts";
import { AUTOMATION_STUDIO_INSTRUCTED_ACT_OPTIONAL_ISSUE_CODE } from "./optional-only.ts";
import { automationStudioInstructedActOptionalSaid } from "./step-fault.ts";

/** Longer words than this are a container's prose, not a control's name, and are not read. */
const MAX_CONTROL_WORDS = 80;

/** The port an optional step's success leaves by. */
const SUCCESS_PORT = /^(?:success|succeeded|done)$/iu;

/** How a step is conditional: the line that makes it so, and the label an `only after:` names. */
type Condition = { kind: "optional" | "only_after" | "after_success"; line: number; label?: string };

/**
 * Each written step that does one of the instruction's requested acts and is
 * conditional (`optional: yes`, `only after:`, or reached only from an
 * optional step's `on success:`), as a refusal at the line that makes it
 * conditional. Read off the resolved plan, after the domain gave each node its
 * element, and placed through the locator the acceptance built; nothing when
 * the plan came from no script or the instruction asks for no lasting act.
 */
export function automationStudioInstructedActOptionalScriptIssues(input: {
  instructionText: string | undefined;
  script: AutomationStudioFlowScript;
  plan: AutomationStudioFlowBootstrapPlan;
  locator: AutomationStudioFlowBootstrapIssueLocator | undefined;
  /** The consequence classes the task's parts ask for (`lastingActs`, t796); a conditional step declaring one is refused whatever its words. */
  askedConsequences?: readonly string[] | undefined;
}): AutomationStudioFlowBootstrapIssue[] {
  const acts = automationStudioInstructedActs(input.instructionText ?? "").filter((act) => AUTOMATION_STUDIO_INSTRUCTED_ACT_LASTING_KINDS.includes(act.kind));
  const askedClasses = new Set((input.askedConsequences ?? []).map((each) => each.trim().toLowerCase()).filter((each) => each !== "" && each !== "none"));
  if ((!acts.length && !askedClasses.size) || !input.locator) return [];
  const conditional = new Map<number, { step: AutomationStudioFlowScriptStep; condition: Condition }>();
  for (const block of input.script.blocks) {
    const optionalLabels = new Set(block.steps.filter((step) => step.label !== undefined && automationStudioFlowScriptStepSaysOptional(step)).map((step) => step.label!));
    // Targets of an optional step's written `on success:`, with the line that wrote it.
    const fromSuccess = new Map<string, number>();
    for (const step of block.steps) {
      if (step.label === undefined || !optionalLabels.has(step.label)) continue;
      for (const branch of step.branches) if (!branch.guard && SUCCESS_PORT.test(branch.port.trim()) && !fromSuccess.has(branch.target)) fromSuccess.set(branch.target, branch.line);
    }
    for (const step of block.steps) {
      if (step.line <= 0) continue;
      const condition: Condition | undefined = automationStudioFlowScriptStepSaysOptional(step) ? { kind: "optional", line: step.optional?.line ?? step.line }
        : step.onlyAfter ? { kind: "only_after", line: step.onlyAfter.line, label: step.onlyAfter.label }
        : step.label !== undefined && fromSuccess.has(step.label) && !reachedOtherwise(block.steps, step, optionalLabels) ? { kind: "after_success", line: fromSuccess.get(step.label)! }
        : undefined;
      if (condition) conditional.set(step.line, { step, condition });
    }
  }
  if (!conditional.size) return [];
  // The control words and declared consequences of each conditional step's node; a join the step made shares its line and has none.
  const controls = new Map<number, string>();
  const declared = new Map<number, readonly string[]>();
  for (const [subflowIndex, subflow] of input.plan.subflows.entries()) {
    for (const [nodeIndex, node] of subflow.nodes.entries()) {
      const line = input.locator.nodes[`${subflowIndex}.${nodeIndex}`]?.line;
      if (line === undefined || !conditional.has(line)) continue;
      if (!controls.has(line)) {
        const words = automationStudioModelFacingControlWords(node.parameters);
        if (words && words.length <= MAX_CONTROL_WORDS) controls.set(line, words);
      }
      if (node.consequences?.length && !declared.has(line)) declared.set(line, node.consequences);
    }
  }
  const issues: AutomationStudioFlowBootstrapIssue[] = [];
  for (const [line, { step, condition }] of conditional) {
    const control = controls.get(line);
    const words = control !== undefined ? [control] : [step.label, step.description].filter((each): each is string => typeof each === "string" && each.trim() !== "");
    const asked = declared.get(line);
    const act = acts.find((candidate) => words.some((each) => doesAct(candidate, each)))
      ?? (asked && !words.some((each) => automationStudioInstructedActWordsDecline(each)) ? acts.find((candidate) => candidate.consequence !== undefined && asked.includes(candidate.consequence)) : undefined);
    // The part's own lasting act, by the class the step declares, where no word of the instruction reads as one (t796).
    const partClass = act || !asked || words.some((each) => automationStudioInstructedActWordsDecline(each)) ? undefined : asked.find((each) => askedClasses.has(each.trim().toLowerCase()));
    if (!act && partClass === undefined) continue;
    issues.push({ severity: "error", code: AUTOMATION_STUDIO_INSTRUCTED_ACT_OPTIONAL_ISSUE_CODE, message: message(act ? { act } : { partClass: partClass! }, step, condition), path: `flow.line.${condition.line}` });
  }
  return issues;
}

/** Whether a written branch other than an optional step's `on success:` also reaches this step, so it runs on other passes too. */
function reachedOtherwise(steps: readonly AutomationStudioFlowScriptStep[], target: AutomationStudioFlowScriptStep, optionalLabels: ReadonlySet<string>): boolean {
  return steps.some((step) => step !== target && step.branches.some((branch) => branch.target === target.label && !branch.guard
    && !(step.label !== undefined && optionalLabels.has(step.label) && SUCCESS_PORT.test(branch.port.trim()))));
}

/** Whether these words do the act: they name it or read it done, and do not close or decline (header). */
function doesAct(act: AutomationStudioInstructedAct, words: string): boolean {
  if (automationStudioInstructedActWordsDecline(words)) return false;
  return automationStudioInstructedActWordsNameAct(act, words) || automationStudioInstructedActWordsShowDone(act.kind, words);
}

function message(asked: { act: AutomationStudioInstructedAct } | { partClass: string }, step: AutomationStudioFlowScriptStep, condition: Condition): string {
  const said = "act" in asked
    ? `${automationStudioInstructedActOptionalSaid(asked.act.id, `the step at line ${step.line}`, false)} The instruction asks for it: ${JSON.stringify(asked.act.quote.slice(0, 120))}. `
    : `The step at line ${step.line} declares \`consequences: ${asked.partClass}\`, the lasting act this part asks for. `;
  if (condition.kind === "only_after") {
    return `${said}This step does what the request asks, and \`only after: ${condition.label}\` makes it run only on passes where ${condition.label} was done; `
      + `on a pass where ${condition.label} finds nothing to press it is passed over and the act is not done. Take \`only after:\` out so it runs on every pass.`;
  }
  if (condition.kind === "after_success") {
    return `${said}This step does what the request asks, but it is reached only from an optional step's \`on success:\`, so it runs only on passes where that step was done; `
      + "on a pass where that step finds nothing to press it is passed over and the act is not done. Write the step so it runs on every pass, not from that branch.";
  }
  return `${said}Take the \`optional:\` line off that step so it always runs; optional is only for something the page sometimes shows, such as a banner or a popup to close.`;
}
