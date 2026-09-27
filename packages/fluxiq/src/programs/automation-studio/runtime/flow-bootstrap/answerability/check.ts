// The one check a build's completed plan passes before it may be proposed:
// could this Flow answer the instruction at all?
//
// **What it catches.** Four live builds against one sentence -- every pair of
// wireless earbuds matching three conditions across every page of results, as a
// table with four named columns -- proposed four different Flows, and every one
// of them was proposed as finished. The completion check confirmed that the plan
// parsed, that its parameters resolved and that its nodes were registered, and
// never asked whether the Flow does what the sentence asked. The clearest of the
// four navigated twice and typed three times: no step of it read anything, so no
// run of it could ever have produced a row.
//
// **What it deliberately does not catch.** Not a chain, an order or a technique.
// A Flow that reaches a search by URL rather than typing into a field answers
// the same request; the four-step and two-step answers to the catalogue search
// were both legitimate. Nor a wrong answer: a Flow that extracts and finds
// nothing has the capability and is proposed, and whether what it found answers
// the request is the finished run's verification to judge
// (`runtime/result-verification/`). The line is capability -- what no run of
// this Flow could produce however well it ran.
//
// **A refusal the build cannot act on is not made.** A bound domain that
// registers nothing which returns rows cannot answer a request for rows however
// the Flow is written, so the library is asked first
// (`./library-record-sets.ts`) and such a build is left where it stood. That is
// what keeps a refusal correctable, which is the difference between one more
// decision and a rewrite loop ending at the no-progress guard.
//
// **What a refusal costs.** No provider call, on any path. A build whose Flow
// can answer pays one plan walk, one walk of the node library, and one pass over
// the instruction text.
import type { AutomationStudioNodeRegistry, AutomationStudioNodeRegistryResolution } from "../../../nodes/index.ts";
import type { AutomationStudioFlowBootstrapPlan } from "../plan/index.ts";
import type { AutomationStudioFlowBootstrapAnswerability } from "./contracts.ts";
import { automationStudioFlowBootstrapInstructionAsk } from "./instruction-ask.ts";
import { automationStudioFlowBootstrapLibraryReturnsRecords } from "./library-record-sets.ts";
import { automationStudioFlowBootstrapPlanRecordSets } from "./plan-record-sets.ts";

/** Steps named in the feedback. A plan holds at most sixteen per subflow. */
const MAX_FEEDBACK_STEPS = 24;

/**
 * What the model is told to do, which matters as much as the refusal.
 *
 * A refusal a model cannot act on produces a rewrite loop instead of a
 * correction: on `run-mug2cjui-500e997c` thirteen of twenty-eight decisions
 * re-sent the same plan against a message the model could not see. So this says
 * what was asked for, in the person's own words, what the draft has, and the one
 * thing to do about it.
 */
const CANNOT_ANSWER_INSTRUCTION = "Nothing was created and this build is still open, so correct it rather than finishing again unchanged. "
  + "cannotAnswer.quote is the person's own words asking for the records, cannotAnswer.columns the columns they named, "
  + "and cannotAnswer.steps the steps you have -- none of those steps produces a set of records. "
  + "Run the step from your node library that returns rows, with the columns the instruction asks for, keep it in the draft, and finish again. "
  + "A Flow that only goes somewhere and acts on it cannot answer a request for records, however well each of its steps runs.";

export function checkAutomationStudioFlowBootstrapAnswersInstruction(input: {
  plan: AutomationStudioFlowBootstrapPlan;
  registry: AutomationStudioNodeRegistry;
  resolution: AutomationStudioNodeRegistryResolution;
  /** The active instructions' own words, title and body, as the build read them. */
  instructionText?: string | undefined;
}): AutomationStudioFlowBootstrapAnswerability {
  const ask = automationStudioFlowBootstrapInstructionAsk(input.instructionText ?? "");
  const found = automationStudioFlowBootstrapPlanRecordSets(input);
  const answerability = {
    recordsRequested: ask.records,
    recordProducerPresent: found.returning.length > 0,
    recordStorePresent: found.storing.length > 0
  };
  if (!ask.records) return { ok: true, answerability };
  if (!automationStudioFlowBootstrapLibraryReturnsRecords(input)) return { ok: true, answerability };
  if (answerability.recordProducerPresent || answerability.recordStorePresent) return { ok: true, answerability };
  return {
    ok: false,
    answerability: { ...answerability, issueCode: "bootstrap.cannot_answer_instruction" },
    issue: {
      severity: "error",
      code: "bootstrap.cannot_answer_instruction",
      // Core's own sentence, quoting nothing, which is what lets the feedback
      // carry it (`../plan/issue-feedback.ts`).
      message: "The instruction asks for a set of records and no step of this Flow produces or saves one, so no run of it could answer.",
      path: "plan.subflows"
    },
    cannotAnswer: {
      asks: "a set of records: rows with named fields",
      ...(ask.quote ? { quote: ask.quote } : {}),
      ...(ask.columns.length ? { columns: ask.columns } : {}),
      lacks: "no step of this Flow produces or saves a set of records",
      steps: found.steps.slice(0, MAX_FEEDBACK_STEPS),
      // Said rather than hidden: a longer Flow is shown its first steps only.
      ...(found.steps.length > MAX_FEEDBACK_STEPS ? { stepsWithheld: true } : {})
    },
    instruction: CANNOT_ANSWER_INSTRUCTION
  };
}
