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
// (`../context.ts`): the failure record's category and code, and its short
// expected/actual text only where nothing in it says how a control was found;
// the failed step's control by its own words, read from the step's node
// parameters (t431, `../../llm/model-facing/control-words.ts`); the step's
// authored parameters, screened against the domain's denied keys (withheld
// whole when the domain declared none); how the target resolved, as a status
// and a count; and what the step was expected to produce, as ids. No page
// content, and nothing the recovery would not already have shown a model.
//
// **Whole.** No value and not the brief is cut (user, 2026-09-30: "Remove ANY
// AND ALL LIMITS ON THE NUMBER OF ELEMENTS PASSED TO MODEL. DO NOT HIDE
// INFORMATION"). Until then a value stopped at 1,200 characters and the brief
// at 6,000.
//
// **Why an instruction.** For the reason `brief.ts` gives: the instruction list
// is the one part of the context every provider renders on every build call.
// It is marked as Core's and never stored.
//
// **What the run concluded, and "already done" (t500, F3).** Live run
// `run-mv6i28zl-a53d36db`: a step that sets a choice failed because the site
// already held that choice, so the control it presses was not offered. The
// diagnosis said the result was still achievable and recoverable, Core's own
// check of the page had compared it with the step's recorded change, and the
// brief said neither: it ordered "re-find the step", and three rounds hunted for
// a control that could not exist, twice pressing another record's control and
// reversing the choice the site held. The brief now says what the diagnosis
// concluded -- its verdicts, the only part of it the run keeps
// (`../structured-diagnosis.ts`) -- and what Core's check found, as the run
// recorded it (`stateRouting`). It offers "already done" before "re-find", and
// forbids changing a lasting choice the build did not make. Every word is
// abstract: no site's words (AGENTS.md, "Model guidance never teaches to the
// test").

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowInstruction, AutomationStudioFlowRunDetail } from "../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../executor.ts";
import { automationStudioNodeRouteSignatures } from "../../route-state/signatures/index.ts";
import { buildAutomationStudioRuntimeRecoveryContext } from "../context.ts";

/** The id every failed-step brief carries, so a reader can tell it from an instruction a person wrote. */
const STEP_FAILURE_BRIEF_INSTRUCTION_ID = "core.step_failure_repair.brief";

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
  const control = text(failure?.control);
  const lines: string[] = [
    `This build repairs a Flow that failed at a step. The Flow you start from (your draft) is the Flow that ran. The site it acts on has changed since the Flow was built: step ${input.nodeId} could not find what it acts on, and the run's own recovery could not re-point it (${ladderText(input.ladder)}).`,
    "",
    "The failed step, as the run recorded it:",
    `- Step: ${input.nodeId} (${definitionId})${label ? `, labelled "${label}"` : ""}.`,
    ...(control ? [`- The control it acts on, by its own words: ${JSON.stringify(control)}.`] : []),
    `- Failure: ${text(failed?.category) ?? "unknown"} (${text(failed?.code) ?? "no code"}).`,
    ...(text(failed?.expected) ? [`- Expected: ${rendered(failed!.expected!)}`] : []),
    ...(text(failed?.actual) ? [`- Actual: ${rendered(failed!.actual!)}`] : []),
    ...(step?.parameters !== undefined ? [`- What the step was authored to act on and with (screened): ${rendered(step.parameters)}`] : ["- The step's authored parameters are not carried here; read them from the step in your draft."]),
    ...(step?.parametersWithheld !== undefined ? [`- Parameters withheld from this brief: ${rendered(step.parametersWithheld)}`] : []),
    ...(target ? [`- How its target resolved: ${rendered(target)}`] : []),
    ...(expected ? [`- What it was expected to produce: ${rendered(expectedText(expected))}`] : []),
    ...concludedLines(input.detail, input.nodeId, input.flow),
    "",
    "What to do:",
    "1. First look at whether the page already shows the result this step was meant to bring about: what it leaves on the site, not the control it acts on. A site can keep an earlier choice, so a step that sets something may find it already set, and its control is then not offered for it.",
    "2. If the page already shows that result, do not look for another control to do it again. Keep the step, make it run only when its result is not already shown (a step that is passed over when its control is absent, or a route on the page's state), then go on with the later steps.",
    `3. Otherwise, re-find step ${input.nodeId} on the site as it is now. Look at it, find what now does what this step was meant to do, and rewrite the step to act on that. It may carry a different name than the one recorded, or sit behind something that has to be opened first; if so, add the step that opens it before this one.`,
    "4. Check every later step that depends on this one -- one that reads what it produced, or acts on what it opened -- and re-find it the same way where it no longer matches.",
    "5. Keep every other step exactly as it is. The steps before the failed one ran and succeeded.",
    "6. The re-found step must still do what the person's request asked of it. Do not swap it for a step that does something else; if nothing on the site does it any more, say so in your completion summary.",
    "7. Never change a lasting choice the site already holds that this build did not make: do not choose a different option where one is already chosen, and do not act on another record in place of the step's own. That undoes what the person already has, and is not a repair."
  ];
  return {
    schemaVersion: "0.1",
    instructionId: STEP_FAILURE_BRIEF_INSTRUCTION_ID,
    title: "Repair brief from Core: a step failed on the site as it is now",
    body: lines.join("\n"),
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

/**
 * What the run concluded about the failed step, as the run recorded it: the
 * diagnosis's verdicts (`llmGate.structuredDiagnosis`, never its prose, which
 * the run does not keep), and what Core's own check of the page found when the
 * step could not run (the failed attempt's `stateRouting`), said only for a
 * step that recorded the change it made. Empty when the run recorded neither.
 */
function concludedLines(detail: AutomationStudioFlowRunDetail, nodeId: string, flow: AutomationStudioFlowDocument | undefined): string[] {
  const lines: string[] = [];
  const diagnosis = record(record(detail.metadata?.llmGate)?.structuredDiagnosis);
  const verdicts = diagnosis ? diagnosisVerdicts(diagnosis) : [];
  if (verdicts.length) lines.push(`- The run's diagnosis of this failure concluded: ${verdicts.join("; ")}.`);
  const node = flow?.nodes.find((candidate) => candidate.id === nodeId);
  const routing = [...(detail.actionAttempts ?? [])].reverse().find((attempt) => attempt.nodeId === nodeId && attempt.status === "failed")?.stateRouting;
  if (node && automationStudioNodeRouteSignatures(node).effect && routing) {
    if (routing.outcome === "no_match") lines.push("- When the step could not run, Core compared the page with what this step changed when the Flow was built, and did not find all of that change on the page. Part of what changed then may have been incidental, so judge the page itself.");
    else if (routing.outcome === "unobserved") lines.push("- When the step could not run, Core could not observe the page to compare it with what this step changed when the Flow was built.");
  }
  return lines;
}

/** The diagnosis's verdicts a re-author can act on, each said with the answer the run recorded. */
function diagnosisVerdicts(diagnosis: JsonObject): string[] {
  const said: Array<[string, string]> = [
    ["stillAchievable", "the step's intended result is still achievable"],
    ["deterministicRecoveryPossible", "it can be recovered without rebuilding the step"]
  ];
  const verdicts = said.flatMap(([key, words]) => {
    const answer = diagnosis[key];
    return answer === "yes" || answer === "no" || answer === "unknown" ? [`${words} (${answer})`] : [];
  });
  if (typeof diagnosis.patchNeeded === "boolean") verdicts.push(`the Flow needs a change (${diagnosis.patchNeeded ? "yes" : "no"})`);
  return verdicts;
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

function rendered(value: JsonValue): string {
  return typeof value === "string" ? value : JSON.stringify(value);
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
