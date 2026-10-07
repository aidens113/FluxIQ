// What the build that repairs a wrong answer is told.
//
// **The defect.** `run-mulwm2dc-0bd95f22`: the check refuted a twelve-row
// answer and said exactly what was wrong -- a column held a link address where
// the title was asked for, and the rows were neither filtered, deduplicated nor
// sorted. The re-author was then called with the Flow's id and a mode,
// and nothing else (`runtime/service.ts`, the `repairRefutedResult` port). Its
// model was shown the same instruction and the same catalog as the first build,
// including the extraction node's own advice to "omit it, keep every item,
// narrow later" -- and was never told that later had arrived. It rebuilt the
// same minimal extraction, and the re-run returned the same twelve rows.
//
// **So the repair build is told it is a repair.** This composes one instruction,
// in Core's words, that rides beside the person's own instructions on every
// decision the build makes: that the Flow it starts from was run and judged
// wrong, what the run stored, Core's findings and fix, the check's own reading
// labelled as the check's, what every earlier repair of this run produced and
// why it was refuted, and what to do -- carry each qualifying clause of the
// request into the parameters of the step that reads the items, as that step's
// catalog entry offers them.
//
// **Why an instruction and not a new slot in the request.** The instruction
// list is the one part of the context every provider renders on every build
// call; a new packet slot would reach only the providers taught to forward it.
// It is marked as Core's (`instructionId`, `tags`) so it is never mistaken for
// something the person wrote, and it is never stored: it exists for one build.
//
// **It says up front that the draft's steps have not run (t194-w70).** The
// draft is seeded from the stored Flow (`../../llm/node-tools/draft-from-flow.ts`),
// so none of its steps has run in this repair, and the Flow is tested -- and the
// repair finished -- only by a run of the whole Flow from its start
// (`../../flow-draft/full-run-required.ts`). Live run murwcmx2's brief said none
// of this, and its step 5 said to keep the steps that reach the page as they
// are: the re-author reran only the read it fixed, both rounds stopped
// untested, and the fix never ran from the Flow's start.
//
// **But it never orders a rerun of a step that is not changed (t274-c4).** An
// unchanged carried step is run by the test as the Flow saved it, from its
// scheduled candidate, and the Merge an optional step joins at is passed
// through (`../../flow-draft/carried-step/`). Live run `run-muw60j7c-bb7c9a62`'s
// brief said every step had to be rerun live and step 5 said "each is still
// rerun live": the re-author reran the carried type step, which keeps its
// stored element and no handle, and the domain refused every rerun of it
// (`target_not_a_handle`) for five rounds until the budget ran out. So the
// brief says the test runs unchanged steps as saved and a changed step with
// its change, and that only a step the test names needs a live rerun.
//
// **Core's account of the read outranks the check's advice (t194-w78).** Live
// run `run-musp39u8-9ac026ab` carried Core's account that the read had read
// every page there was and the check's advice to raise the page bound, and step
// 3 said to make every fix the advice named: the re-author raised the bound six
// times per try and reread the same rows. Step 3 now says that where the two
// disagree, Core's account stands. ACT_STEPS carries no such line, because a
// Flow that reads nothing has no read to account for.
//
// **What it deliberately does not name.** Core does not know what a filter
// condition, a page or a column is called in the bound domain, so the brief
// speaks of "the step that reads the items" and "its own parameters", and the
// catalog entry the model is already shown supplies the names.
//
// **And it says a Flow can need no change (W17).** Live run
// `run-muw5zv4m-52d83027`: the check refuted a cart the Flow had built exactly
// as asked, the brief said only "change the Flow", and the re-author spent 46
// decisions changing a step that had done what was asked. The brief now
// carries the run's own record -- what each step changed, and the page before
// and after the run, as the check was shown them -- and a last section: where
// that record contradicts the check, complete the seeded draft unchanged with
// `nothingToChange: true` and the reason as the summary, and Core ends the repair there
// (`./nothing-to-change.ts`). It is said as the exception it is: a fix the
// record supports is still made.

import type { AutomationStudioFlowInstruction } from "../../../model/index.ts";
// Type-only, for the same cycle: the literal below is held to Core's code by the compiler.
import type { AUTOMATION_STUDIO_RESULT_REPAIR_FINDING_CODES } from "../../result-verification/index.ts";
// The read-account barrel and not the result-verification one: the value edge
// to that barrel would close a cycle, because `result-verification/run-outcome.ts`
// already calls into this directory (`reauthor.ts` says the same of its code).
import { automationStudioResultReadSentence } from "../../result-verification/read-account/index.ts";
import type { AutomationStudioResultRepairHistoryEntry } from "./history.ts";
import { automationStudioResultRepairUnchangedInARow } from "./history.ts";

/** The id every repair brief carries, so a reader can tell it from an instruction a person wrote. */
export const AUTOMATION_STUDIO_REAUTHOR_BRIEF_INSTRUCTION_ID = "core.result_repair.brief";

/**
 * The finding Core makes of a Flow that reads no list and stores no records
 * (`result-verification/repair-directive.ts`). A refutation carrying it is about
 * acts, and the list-read advice below is withheld from it.
 */
const ACTS_JUDGED_UNDONE: (typeof AUTOMATION_STUDIO_RESULT_REPAIR_FINDING_CODES)["actsJudgedUndone"] = "result.acts_judged_undone";

/** What to do when the Flow reads a list: carry each narrowing clause into the step that reads the items. */
const READ_STEPS: readonly string[] = [
  "1. Read the request clause by clause. For every clause that narrows the answer -- which items to keep or drop (by a value, a range, a word or a pattern), how many pages or items to read, which order to put them in, or that an item may appear only once -- put it into the parameters of the step that reads the items, using the parameters that step's catalog entry lists (a condition list, a limit), or the most passes of its loop. Leaving a clause out to be narrowed later is no longer right: this repair is the later.",
  "2. Where a column holds the wrong kind of value (an address where text was asked for, one field where another was meant), change that step's column mapping so the column holds what the request asked for.",
  "3. Act on the check's findings and advice above. Where the advice names a fix, make it -- but where \"How the read went\" shows the Flow already pages, deduplicates or filters, change that setting or condition in place instead of adding a step for it. Where the check's advice contradicts \"How the read went\" (Core's account of what the step did) -- it asks for more pages of a read that already read every page there was, say, or a filter the step already applies -- Core's account stands and that part of the advice is not followed: changing that setting again reads the same items. A condition that rejected rows the request wanted is the one to correct. Where Core checked the rows the check names, the same holds: advice resting on a row Core lists as in the result although the check calls it left out is not followed -- that row was never left out -- while a condition Core lists as really leaving out a row the request wants is the one to correct.",
  "4. If the step has no parameter that can express a clause, keep the rest of the fix and say which clause in your completion summary rather than dropping it silently.",
  "5. Change only what the findings require: a step that reaches the page keeps its parameters unless the findings say they are wrong, and is left as it is -- the test runs it as the Flow saved it."
];

/**
 * What to do when the Flow reads nothing (`run-muqiojz4-04a7a8fc`, bigbox cart:
 * every item of the list above was about a read the request never asked for,
 * and the re-author chased them instead of the missing Add to cart).
 */
const ACT_STEPS: readonly string[] = [
  "1. Read the request act by act -- each thing it asks to be done on the site, with the item, option, size, quantity and order it names -- and find the step that does each one.",
  "2. Act on the check's findings and advice above: where an act is missing, add the step that does it; where a step did its act differently (another item, option, size or quantity, or once where twice was asked), correct that step's parameters.",
  "3. The Flow stores nothing and that is not what was judged wrong: do not add a step that reads or stores anything unless the request asks for something to be read back.",
  "4. If no step can do an act, keep the rest of the fix and say which act in your completion summary rather than dropping it silently.",
  "5. Change only what the findings require: a step that did its act keeps its parameters and is left as it is -- the test runs it as the Flow saved it."
];

/**
 * Said before the findings: the draft is the Flow being repaired, how the Flow
 * comes to be tested whole, and which steps -- only the ones the test names --
 * need a live rerun first, in the words of the test's own refusal
 * (`../../flow-draft/full-run-required.ts`). The brief is written before the
 * draft is seeded, so it cannot name those steps by number; the test's refusal
 * and the round's judgement do (`../../flow-bootstrap/unfinished-build/not-run.ts`).
 * A rerun of a carried step is put back where its node started in the refuted
 * run, where that run recorded it (`../../llm/node-tools/step-place.ts`).
 */
const NOT_RUN_LINES: readonly string[] = [
  "Your draft is the Flow being repaired, as it was saved, and none of its steps has run in this repair. The Flow is tested -- and this repair finished -- only by a run of the whole Flow from its start: each step you leave unchanged is run as the Flow saved it, and each step you change is run with your change.",
  "So change only the steps that need it, and make each change by running the step with it (amend_draft rerun, with the corrected argument); do not rerun a step you are not changing. If the test cannot run a step of the saved Flow as it stands, it names that step by number (not_run_in_this_build): rerun only those, adding the consequences each would have to its input ([] when it leaves nothing lasting); a rerun of a carried step is first put back where its node started in the run being repaired, where that run recorded it.",
  "Then complete: the whole Flow is tested from its start and judged."
];

/**
 * The ending for a Flow that already does what was asked, said after what to
 * do: when it is right, how it is taken -- the seeded draft completed
 * unchanged, the summary its reason -- and that it is no way out of a fix the
 * record supports (`./nothing-to-change.ts`).
 */
const NOTHING_TO_CHANGE_LINES: readonly string[] = [
  "When the Flow needs no change:",
  "The check reads the run and can be wrong. If what the run itself recorded above -- each step's change, and the page before and after -- shows the Flow did every act the request asks for, with the item, option, size and quantity it names, and that what the check calls wrong did not happen, the Flow needs no change. Then complete with your draft exactly as it was seeded and nothingToChange: true in the result: amend nothing and rerun nothing. Your completion summary is your reason: name the steps and what each changed that shows it. Core then changes nothing, tests nothing and ends this repair, recording your reason beside the check's verdict, which stands.",
  "This is not a way out of a fix. Where the record shows a step did something else, does not show an act was done, or does not settle what the check says, make the fix as above. Only a completion that says nothingToChange: true, of the Flow as it was seeded, ends the repair this way."
];

/**
 * The brief for one repair build.
 *
 * `current` is the refutation this build answers; `history` the ones before it,
 * oldest first. Priority is set below any a person's instruction carries, so
 * when the instruction budget is tight it is the brief's tail that is cut and
 * never the request itself.
 */
export function automationStudioReauthorBrief(input: {
  projectId: string;
  flowId: string;
  current: AutomationStudioResultRepairHistoryEntry;
  history: readonly AutomationStudioResultRepairHistoryEntry[];
  maxAttempts: number;
  now: number;
}): AutomationStudioFlowInstruction {
  const lines: string[] = [
    `This build is repair attempt ${input.current.attempt} of at most ${input.maxAttempts}. The Flow you start from (your draft) has already run, and its answer was judged NOT to answer the request. Change the Flow so that it does, unless the run's own record shows it already does (see "When the Flow needs no change" below). Rebuilding the same Flow will produce the same answer and be judged wrong again.`,
    "",
    ...NOT_RUN_LINES,
    "",
    "What the last run produced and why it was judged wrong:",
    ...refutationLines(input.current),
    ...recordSection(input.current),
    ...historySection(input.history, input.current),
    "",
    "What to do:",
    ...(readsNothing(input.current) ? ACT_STEPS : READ_STEPS),
    "",
    ...NOTHING_TO_CHANGE_LINES
  ];
  // Whole: no character cap on the brief or on any earlier attempt in it.
  const body = lines.join("\n");
  return {
    schemaVersion: "0.1",
    instructionId: AUTOMATION_STUDIO_REAUTHOR_BRIEF_INSTRUCTION_ID,
    title: "Repair brief from Core: the last answer was judged wrong",
    body,
    scope: { kind: "flow", projectId: input.projectId, flowId: input.flowId },
    priority: Number.MIN_SAFE_INTEGER,
    status: "active",
    requirement: "required",
    tags: ["generation", "error"],
    createdAt: input.now,
    updatedAt: input.now,
    metadata: { source: "core.result_repair", attempt: input.current.attempt }
  };
}

/** Whether Core found this refuted Flow reads no list and stores no records. */
function readsNothing(entry: AutomationStudioResultRepairHistoryEntry): boolean {
  return (entry.directive?.findings ?? []).some((finding) => finding.code === ACTS_JUDGED_UNDONE);
}

function refutationLines(entry: AutomationStudioResultRepairHistoryEntry): string[] {
  const acts = readsNothing(entry);
  const lines = [`- Core's verdict: ${entry.reason}`, `- Stored: ${acts ? "nothing, and the Flow reads no list and stores no records, so what was judged is what its steps did" : producedText(entry)}.`];
  const authored = entry.step?.parameters ? `, authored with parameters ${entry.step.parameters}` : "";
  if (entry.step) lines.push(acts ? `- The run was judged at step ${entry.step.nodeId} (${entry.step.definitionId})${authored}: where the run ended, not a step known to be wrong.` : `- The rows came out of step ${entry.step.nodeId} (${entry.step.definitionId})${authored}.`);
  // How the read went, before anyone's advice: advice written without it once
  // asked for a paging loop and a filter around a step that already had both.
  for (const read of entry.reads ?? []) lines.push(`- How the read went: ${automationStudioResultReadSentence(read, "full")}`);
  for (const line of entry.directive?.fix ?? []) lines.push(`- Core's fix: ${line}`);
  // Core's check of the rows the check names, before the check's own reading it
  // qualifies (`../../result-verification/request-rows/checked-rows.ts`). Live run
  // `run-muw60j7c-bb7c9a62`: the check said the Plus condition alone left out
  // B0J5MCMBAY and B07Z1RZGJG, both in the result; the re-author got that advice
  // unmarked, followed it, and threw the answer away (t274-c25b).
  for (const line of entry.directive?.checked ?? []) lines.push(`- Core checked the rows the check names: ${line}`);
  const judgement = entry.directive?.judgement;
  if (judgement?.expected) lines.push(`- The check read the request as asking for: ${judgement.expected}`);
  if (judgement?.observed) lines.push(`- The check saw instead: ${judgement.observed}`);
  if (judgement?.advice) lines.push(`- The check's advice: ${judgement.advice}`);
  return lines;
}

/**
 * What the refuted run itself recorded, as the check was shown it: the page
 * before the run did anything, each step's change where it stayed, per run of
 * it, and the page it ended on. Absent when the summary carried none of them.
 */
function recordSection(entry: AutomationStudioResultRepairHistoryEntry): string[] {
  const lines: string[] = [];
  if (entry.startView) lines.push(`- Before the run did anything, the page showed: ${JSON.stringify(entry.startView.view)}`);
  for (const step of entry.changes ?? []) {
    const runs = step.changed.map((change, index) => `run ${index + 1} ${[
      ...(change.added ? [`added ${JSON.stringify(change.added)}`] : []),
      ...(change.removed ? [`removed ${JSON.stringify(change.removed)}`] : [])
    ].join(" and ")}`);
    lines.push(`- Step ${step.nodeId} (${step.definitionId}${step.label ? `, ${JSON.stringify(step.label)}` : ""}) changed the page: ${runs.join("; ")}`);
  }
  if (entry.endView) lines.push(`- The run ended${entry.endView.after === undefined ? "" : ` (after ${entry.endView.after})`} on: ${JSON.stringify(entry.endView.view)}`);
  return lines.length ? ["", "What the run itself recorded (Core's record of the page, not the check's reading):", ...lines] : [];
}

function historySection(history: readonly AutomationStudioResultRepairHistoryEntry[], current: AutomationStudioResultRepairHistoryEntry): string[] {
  if (!history.length) return [];
  const lines = ["", "Earlier repair attempts on this run, oldest first. Do not repeat an edit that was already refuted:"];
  const entries = [...history, current];
  for (let index = 0; index < history.length; index += 1) {
    const before = entries[index]!;
    const after = entries[index + 1]!;
    const unchanged = before.answerDigest === after.answerDigest;
    const text = [
      `- Attempt ${before.attempt} repaired the answer below and its Flow then produced ${readsNothing(after) ? "no records, which is all a Flow that reads nothing produces" : producedText(after)}${unchanged ? " -- exactly the same answer as before the repair, so that edit changed nothing that matters" : ""}.`,
      ...refutationLines(before).map((line) => `  ${line}`)
    ].join("\n");
    lines.push(text);
  }
  if (automationStudioResultRepairUnchangedInARow(entries) > 0) {
    lines.push(readsNothing(current)
      ? "- The last repair did not change the answer. Make a different change this time: compare each act the request asks for with the step that does it."
      : "- The last repair did not change the answer. Make a different change this time: the parameters of the step that reads the items are the place to look.");
  }
  return lines;
}

function producedText(entry: AutomationStudioResultRepairHistoryEntry): string {
  const sets = entry.produced.recordSets.map((set) => `${set.recordCount} rows with columns ${set.columns.join(", ") || "(none)"}`);
  return sets.length ? `${entry.produced.totalRecordCount} rows in total (${sets.join("; ")})` : `${entry.produced.totalRecordCount} rows and no record set`;
}
