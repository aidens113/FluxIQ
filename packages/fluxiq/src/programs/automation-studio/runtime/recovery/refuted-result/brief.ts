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
// **What it deliberately does not name.** Core does not know what a filter
// condition, a page or a column is called in the bound domain, so the brief
// speaks of "the step that reads the items" and "its own parameters", and the
// catalog entry the model is already shown supplies the names.

import type { AutomationStudioFlowInstruction } from "../../../model/index.ts";
import type { AutomationStudioResultRepairHistoryEntry } from "./history.ts";
import { automationStudioResultRepairUnchangedInARow } from "./history.ts";

/** The id every repair brief carries, so a reader can tell it from an instruction a person wrote. */
export const AUTOMATION_STUDIO_REAUTHOR_BRIEF_INSTRUCTION_ID = "core.result_repair.brief";

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
    `This build is repair attempt ${input.current.attempt} of at most ${input.maxAttempts}. The Flow you start from (your draft) has already run, and its answer was judged NOT to answer the request. Change the Flow so that it does. Rebuilding the same Flow will produce the same answer and be judged wrong again.`,
    "",
    "What the last run produced and why it was judged wrong:",
    ...refutationLines(input.current),
    ...historySection(input.history, input.current),
    "",
    "What to do:",
    "1. Read the request clause by clause. For every clause that narrows the answer -- which items to keep or drop (by a value, a range, a word or a pattern), how many pages or items to read, which order to put them in, or that an item may appear only once -- put it into the parameters of the step that reads the items, using the parameters that step's catalog entry lists (a condition list, a pagination setting, a limit). Leaving a clause out to be narrowed later is no longer right: this repair is the later.",
    "2. Where a column holds the wrong kind of value (an address where text was asked for, one field where another was meant), change that step's column mapping so the column holds what the request asked for.",
    "3. Act on the check's findings and advice above. Where the advice names a fix, make it.",
    "4. If the step has no parameter that can express a clause, keep the rest of the fix and say which clause in your completion summary rather than dropping it silently.",
    "5. Change only what the findings require; keep the steps that reach the page as they are unless the findings say they are wrong."
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

function refutationLines(entry: AutomationStudioResultRepairHistoryEntry): string[] {
  const lines = [`- Core's verdict: ${entry.reason}`, `- Stored: ${producedText(entry)}.`];
  if (entry.step) lines.push(`- The rows came out of step ${entry.step.nodeId} (${entry.step.definitionId})${entry.step.parameters ? `, authored with parameters ${entry.step.parameters}` : ""}.`);
  for (const line of entry.directive?.fix ?? []) lines.push(`- Core's fix: ${line}`);
  const judgement = entry.directive?.judgement;
  if (judgement?.expected) lines.push(`- The check read the request as asking for: ${judgement.expected}`);
  if (judgement?.observed) lines.push(`- The check saw instead: ${judgement.observed}`);
  if (judgement?.advice) lines.push(`- The check's advice: ${judgement.advice}`);
  return lines;
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
      `- Attempt ${before.attempt} repaired the answer below and its Flow then produced ${producedText(after)}${unchanged ? " -- exactly the same answer as before the repair, so that edit changed nothing that matters" : ""}.`,
      ...refutationLines(before).map((line) => `  ${line}`)
    ].join("\n");
    lines.push(text);
  }
  if (automationStudioResultRepairUnchangedInARow(entries) > 0) {
    lines.push("- The last repair did not change the answer. Make a different change this time: the parameters of the step that reads the items are the place to look.");
  }
  return lines;
}

function producedText(entry: AutomationStudioResultRepairHistoryEntry): string {
  const sets = entry.produced.recordSets.map((set) => `${set.recordCount} rows with columns ${set.columns.join(", ") || "(none)"}`);
  return sets.length ? `${entry.produced.totalRecordCount} rows in total (${sets.join("; ")})` : `${entry.produced.totalRecordCount} rows and no record set`;
}
