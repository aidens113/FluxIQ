// What the build that re-finds a failed step is told.
//
// The wrong-answer brief (`brief.ts`) tells a build that the Flow ran and gave
// the wrong answer. This one tells it something narrower: the Flow ran, one
// step could not find what it acts on, and the site has changed since the Flow
// was built. The build starts from the Flow as its draft (`mode: "extend"`), so
// the brief says which step to re-find, what that step was, how it failed, and
// that every other step stays.
//
// **What it carries, and from where.** Only what the run record already holds,
// through the same screen the recovery's own context passes
// (`../context.ts`): the failure record's category, code and its short
// expected/actual text with anything locator-shaped removed; the step's
// authored parameters, screened against the domain's denied keys (withheld
// whole when the domain declared none); how the target resolved, as scores and
// signal names; and what the step was expected to produce, as ids. No page
// content, and nothing the recovery would not already have shown a model.
//
// **Why an instruction.** For the reason `brief.ts` gives: the instruction list
// is the one part of the context every provider renders on every build call.
// It is marked as Core's and never stored.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowInstruction, AutomationStudioFlowRunDetail } from "../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../executor.ts";
import { buildAutomationStudioRuntimeRecoveryContext } from "../context.ts";

/** The id every failed-step brief carries, so a reader can tell it from an instruction a person wrote. */
const STEP_FAILURE_BRIEF_INSTRUCTION_ID = "core.step_failure_repair.brief";

/** The most characters the brief spends, as `brief.ts` bounds its own. */
const MAX_BRIEF_CHARS = 6_000;
/** The most characters any one carried value spends. */
const MAX_VALUE_CHARS = 1_200;

/**
 * The brief for one failed-step re-author.
 *
 * `nodeId` is the failed step; `ladder` is how the run's recovery ended, as the
 * decision recorded it. Priority is set below any a person's instruction
 * carries, so a tight instruction budget cuts the brief and never the request.
 */
export function automationStudioStepFailureReauthorBrief(input: {
  projectId: string;
  flowId: string;
  nodeId: string;
  detail: AutomationStudioFlowRunDetail;
  failedTraceAttempt?: AutomationStudioNodeAttemptTrace | undefined;
  flow?: AutomationStudioFlowDocument | undefined;
  deniedEvidenceKeys?: readonly string[] | undefined;
  ladder: JsonObject;
  now: number;
}): AutomationStudioFlowInstruction {
  const context = buildAutomationStudioRuntimeRecoveryContext({
    detail: input.detail,
    ...(input.failedTraceAttempt ? { failedAttempt: input.failedTraceAttempt } : {}),
    ...(input.flow ? { flow: input.flow } : {}),
    ...(input.deniedEvidenceKeys ? { deniedEvidenceKeys: input.deniedEvidenceKeys } : {})
  });
  const failure = record(context.sections.failure);
  const failed = record(failure?.failure);
  const step = records(record(context.sections.step_parameters)?.steps).filter((candidate) => candidate.nodeId === input.nodeId).at(-1);
  const expected = record(context.sections.expected_transition);
  const target = context.sections.failed_target;
  const definitionId = text(failure?.definitionId) ?? text(step?.definitionId) ?? "unknown";
  const label = text(step?.label);
  const lines: string[] = [
    `This build repairs a Flow that failed at a step. The Flow you start from (your draft) is the Flow that ran. The site it acts on has changed since the Flow was built: step ${input.nodeId} could not find what it acts on, and the run's own recovery could not re-point it (${ladderText(input.ladder)}).`,
    "",
    "The failed step, as the run recorded it:",
    `- Step: ${input.nodeId} (${definitionId})${label ? `, labelled "${label}"` : ""}.`,
    `- Failure: ${text(failed?.category) ?? "unknown"} (${text(failed?.code) ?? "no code"}).`,
    ...(text(failed?.expected) ? [`- Expected: ${bounded(failed!.expected!)}`] : []),
    ...(text(failed?.actual) ? [`- Actual: ${bounded(failed!.actual!)}`] : []),
    ...(step?.parameters !== undefined ? [`- What the step was authored to act on and with (screened): ${bounded(step.parameters)}`] : ["- The step's authored parameters are not carried here; read them from the step in your draft."]),
    ...(step?.parametersWithheld !== undefined ? [`- Parameters withheld from this brief: ${bounded(step.parametersWithheld)}`] : []),
    ...(target ? [`- How its target resolved: ${bounded(target)}`] : []),
    ...(expected ? [`- What it was expected to produce: ${bounded(expectedText(expected))}`] : []),
    "",
    "What to do:",
    `1. Re-find step ${input.nodeId} on the site as it is now. Look at it, find what now does what this step was meant to do, and rewrite the step to act on that. It may carry a different name than the one recorded, or sit behind something that has to be opened first; if so, add the step that opens it before this one.`,
    "2. Check every later step that depends on this one -- one that reads what it produced, or acts on what it opened -- and re-find it the same way where it no longer matches.",
    "3. Keep every other step exactly as it is. The steps before the failed one ran and succeeded.",
    "4. The re-found step must still do what the person's request asked of it. Do not swap it for a step that does something else; if nothing on the site does it any more, say so in your completion summary."
  ];
  return {
    schemaVersion: "0.1",
    instructionId: STEP_FAILURE_BRIEF_INSTRUCTION_ID,
    title: "Repair brief from Core: a step failed on the site as it is now",
    body: lines.join("\n").slice(0, MAX_BRIEF_CHARS),
    scope: { kind: "flow", projectId: input.projectId, flowId: input.flowId },
    priority: Number.MIN_SAFE_INTEGER,
    status: "active",
    requirement: "required",
    tags: ["generation", "error"],
    createdAt: input.now,
    updatedAt: input.now,
    metadata: { source: "core.step_failure_repair", nodeId: input.nodeId }
  };
}

/** The ladder's ending, in its own codes, as one parenthetical. */
function ladderText(ladder: JsonObject): string {
  const parts: string[] = [];
  if (typeof ladder.skipCode === "string") parts.push(`the recovery stopped with ${ladder.skipCode}`);
  if (typeof ladder.failureCode === "string") parts.push(`its patch failed with ${ladder.failureCode}`);
  if (Array.isArray(ladder.targetRefusals) && ladder.targetRefusals.length) parts.push(`a target override was refused as ${ladder.targetRefusals.join(", ")}`);
  if (typeof ladder.declined === "string") parts.push(`the model declined: ${ladder.declined}`);
  return parts.length ? parts.join("; ") : "it executed no patch";
}

function expectedText(expected: JsonObject): JsonObject {
  return Object.fromEntries(["expectedRoute", "expectedStatus", "expectedOutputIds", "expectedEffectTypes"]
    .filter((key) => expected[key] !== undefined)
    .map((key) => [key, expected[key]!])) as JsonObject;
}

function bounded(value: JsonValue): string {
  const rendered = typeof value === "string" ? value : JSON.stringify(value);
  return rendered.length > MAX_VALUE_CHARS ? `${rendered.slice(0, MAX_VALUE_CHARS)}...` : rendered;
}

function text(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function record(value: JsonValue | undefined): JsonObject | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}

function records(value: JsonValue | undefined): JsonObject[] {
  return Array.isArray(value) ? value.map(record).filter((item): item is JsonObject => item !== undefined) : [];
}
