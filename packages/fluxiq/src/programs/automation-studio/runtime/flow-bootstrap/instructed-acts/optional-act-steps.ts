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
// offer"), so a dismissal stays optional.
//
// The refusal is the draft path's sentence (`automationStudioInstructedActOptionalSaid`)
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

/**
 * Each written step that says `optional: yes` and does one of the
 * instruction's requested acts, as a refusal at its `optional:` line. Read off
 * the resolved plan, after the domain gave each node its element, and placed
 * through the locator the acceptance built; nothing when the plan came from no
 * script or the instruction asks for no lasting act.
 */
export function automationStudioInstructedActOptionalScriptIssues(input: {
  instructionText: string | undefined;
  script: AutomationStudioFlowScript;
  plan: AutomationStudioFlowBootstrapPlan;
  locator: AutomationStudioFlowBootstrapIssueLocator | undefined;
}): AutomationStudioFlowBootstrapIssue[] {
  const acts = automationStudioInstructedActs(input.instructionText ?? "").filter((act) => AUTOMATION_STUDIO_INSTRUCTED_ACT_LASTING_KINDS.includes(act.kind));
  if (!acts.length || !input.locator) return [];
  const optional = new Map<number, AutomationStudioFlowScriptStep>();
  for (const block of input.script.blocks) {
    for (const step of block.steps) if (step.line > 0 && automationStudioFlowScriptStepSaysOptional(step)) optional.set(step.line, step);
  }
  if (!optional.size) return [];
  // The control words of each optional step's node; a join the step made shares its line and has none.
  const controls = new Map<number, string>();
  for (const [subflowIndex, subflow] of input.plan.subflows.entries()) {
    for (const [nodeIndex, node] of subflow.nodes.entries()) {
      const line = input.locator.nodes[`${subflowIndex}.${nodeIndex}`]?.line;
      if (line === undefined || !optional.has(line) || controls.has(line)) continue;
      const words = automationStudioModelFacingControlWords(node.parameters);
      if (words && words.length <= MAX_CONTROL_WORDS) controls.set(line, words);
    }
  }
  const issues: AutomationStudioFlowBootstrapIssue[] = [];
  for (const [line, step] of optional) {
    const control = controls.get(line);
    const words = control !== undefined ? [control] : [step.label, step.description].filter((each): each is string => typeof each === "string" && each.trim() !== "");
    const act = acts.find((candidate) => words.some((each) => doesAct(candidate, each)));
    if (!act) continue;
    issues.push({ severity: "error", code: AUTOMATION_STUDIO_INSTRUCTED_ACT_OPTIONAL_ISSUE_CODE, message: message(act, step), path: `flow.line.${step.optional?.line ?? line}` });
  }
  return issues;
}

/** Whether these words do the act: they name it or read it done, and do not close or decline (header). */
function doesAct(act: AutomationStudioInstructedAct, words: string): boolean {
  if (automationStudioInstructedActWordsDecline(words)) return false;
  return automationStudioInstructedActWordsNameAct(act, words) || automationStudioInstructedActWordsShowDone(act.kind, words);
}

function message(act: AutomationStudioInstructedAct, step: AutomationStudioFlowScriptStep): string {
  return `${automationStudioInstructedActOptionalSaid(act.id, `the step at line ${step.line}`, false)} `
    + `The instruction asks for it: ${JSON.stringify(act.quote.slice(0, 120))}. `
    + "Take the `optional:` line off that step so it always runs; optional is only for something the page sometimes shows, such as a banner or a popup to close.";
}
