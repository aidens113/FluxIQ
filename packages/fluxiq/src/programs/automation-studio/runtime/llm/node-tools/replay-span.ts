// Running a repeat of the draft the way the Flow runs it: once per row (t252).
//
// **The defect this closes.** The build's test sent each step once, in draft
// order, and a repeat span was sent once on the row the build explored and
// excused as a step the Flow does not always run (`../../flow-draft/routing.ts`).
// So nothing ever ran the loop the stored Flow holds: live run
// `run-murwcaj0-40e56557` pressed one row's Confirm while exploring, a row its
// own listing excluded, the test resent that one press, found it gone, and the
// judge read a Flow that "confirms only" that row.
//
// **What a span is run as.** The rule the assembler uses decides which loop it
// is (`../../flow-bootstrap/authoring/draft-routing.ts`): a span over a step
// whose node declares an array output walks that step's rows; one over a step
// that declares none repeats while that check succeeds.
//
//   list   -- the rows are the list step's output values *in this test*
//             (`outputs[<its array port>]` on its answer). Each member is sent
//             once per row, in order: with the row under `item` when its node
//             declares an `item` input (the assembler wires the row to exactly
//             those), and with its state bindings resolved against
//             `{item: row}` by the executor's own resolver
//             (`resolveAutomationNodeParameterValues`), so an input takes its
//             test value and a row field the pass's row. More rows than a For
//             Each takes fail the span, as the For Each fails the Flow.
//   while  -- the check has just been asked, on its own line. While it
//             replays, the body runs once and the check is asked again. Past
//             the same bound the span fails.
//
// **When the test knows no rows, nothing changes.** A list step that was only
// checked or did not replay, a host that sends no `outputs`, rows that are not
// records, or a caller that cannot describe the nodes: the span is not
// planned here and the walker sends it once, excused, exactly as before t252.
//
// **What a member's outcome says.** Every pass's status, and the status of its
// first pass that did not pass, else `replayed`. A pass answering
// `remembered`, `present` or `verified` passes: the row the build already did,
// or a lasting act checked. A member's mode is the same on every pass
// (`automationStudioFlowDraftStepReplayMode`): a lasting act is a check per
// row, never a press. A member of a span that ran has `passes`, and the verdict
// no longer excuses it as a step the Flow does not always run
// (`../../flow-draft/dry-run.ts`). One that did not pass after a lasting act
// was only checked is excused for that, and says so (`excused: "withheld"`,
// `../../flow-draft/excused.ts`).
//
// **Each pass's call says which pass and row it is (t195 w43).** Live run
// `run-musp474o-e0ed7432` ran a repeated Confirm once per kept row, and no
// step folder said which row a pass was on: `call.json` writes the row by
// field names only (`../step-log/field-names.ts`), and only a judged test's
// judge request named the rows (`../../result-verification/build-test/span-rows.ts`).
// Two of its three tests were never judged. So every call of a pass is sent
// inside a step-log pass scope (`../step-log/scope.ts`): its number, the pass
// count of a list, and the label of its row where the list read answered
// `readRows.rows` in this test -- pass n is row n, as the judge reads it --
// screened by the check the judge's are (`screenAutomationStudioLlmEvidence`), so
// a label it withholds is written withheld. Never a row's values.
//
// **An earlier step's output (P5, t270)** resolves against what the steps
// before the span produced in this walk (`./replay-draft.ts`) and what the
// members before it produced on this pass. Each pass starts with none of the
// last pass's, so a stale value from an earlier row is never sent.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { automationStudioFlowDraftScheduledCandidateCall } from "../../flow-draft/scheduled-candidate/index.ts";
import { getAutomationNodeDefinition, resolveAutomationNodeParameterValues } from "../../../nodes/index.ts";
import {
  automationStudioFlowDraftHoldsBinding,
  automationStudioFlowDraftStepId,
  automationStudioFlowDraftStepOutputsState,
  type AutomationStudioFlowDraftReplayMode,
  type AutomationStudioFlowDraftReplayOutcome,
  type AutomationStudioFlowDraftReplayPass,
  type AutomationStudioFlowDraftStep
} from "../../flow-draft/index.ts";
import type { AUTOMATION_STUDIO_BUILD_TEST_READ_ROWS_KEY } from "../../result-verification/index.ts";
import type { automationStudioLlmEvidenceParseToolExecutionResult } from "../evidence-loop-decision.ts";
import { screenAutomationStudioLlmEvidence } from "../harness/index.ts";
import { automationStudioLlmStepLogScope } from "../step-log/index.ts";
import {
  AUTOMATION_STUDIO_NODE_REPLAY_ITEM_KEY,
  AUTOMATION_STUDIO_NODE_REPLAY_RESULT_CODES,
  automationStudioNodeReplayStatus,
  automationStudioNodeReplayStepCall,
  automationStudioNodeReplayToolId,
  automationStudioNodeReplayVerifyCall,
  type AutomationStudioNodeReplayPass
} from "./replay.ts";

/** A span whose list held more rows than a For Each takes: the Flow would fail there too. */
export const AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_LOOP_BOUND_CODE = "core.replay.loop_bound";

/** A step whose state binding had nothing to take its value from: nothing was sent. */
export const AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_UNRESOLVED_BINDING_CODE = "core.replay.unresolved_binding";

/**
 * The member of a replayed read's answer that names its rows: the judge's key
 * (`../../result-verification/build-test/read-rows.ts`), held to it by type.
 * Imported as a type only: any value import out of `result-verification`
 * here (that module, or `read-account/alone-rows.ts`) closes a cycle back into
 * the llm barrel, and with it the service's build tests
 * (`../../tests/service-authoring/tests/confirm-requests-build.test.ts`)
 * failed `flow_bootstrap.pre_provider_validation_failed`.
 */
const READ_ROWS_KEY: typeof AUTOMATION_STUDIO_BUILD_TEST_READ_ROWS_KEY = "readRows";

/** What a row label the screen refuses is written as: the judge's word (`../../result-verification/read-account/alone-rows.ts`). */
const WITHHELD_LABEL = "(withheld)";

/** The For Each node the assembler builds a list loop from, whose bound the test applies. */
const FOR_EACH_NODE_ID = "builtin.control.for-each";

/**
 * What the test needs to know of a step's node: its ports. Structurally the
 * build's catalog entry (`../../flow-bootstrap/plan/contracts.ts`), so a caller
 * hands its node lookup over as it is.
 */
export type AutomationStudioFlowDraftReplayNode = {
  inputs: readonly { id: string }[];
  outputs: readonly { id: string; type: string }[];
  outputAction?: { required: true; fixed?: string; allowed?: string[] };
};

/** The node a step names, by the step's `actionId`, or nothing for a node the caller cannot describe. */
export type AutomationStudioFlowDraftReplayNodeOf = (nodeId: string) => AutomationStudioFlowDraftReplayNode | undefined;

/** One call's answer as the replay reads it; `readable: false` is a failed step, never a skipped one (`./replay-draft.ts`). */
export type AutomationStudioFlowDraftReplayAnswer =
  | { readable: true; result: NonNullable<ReturnType<typeof automationStudioLlmEvidenceParseToolExecutionResult>> }
  | { readable: false };

/**
 * What one call of the test answered, for a judge of what the build did. A
 * pass of a repeat says which, of how many (`pass`, `of`).
 */
export type AutomationStudioFlowDraftReplayObservation = { step: number; stepId?: string; resultCode?: string; evidence: JsonValue; pass?: number; of?: number };

/**
 * A repeat the test runs as the Flow would: over the list's rows, or while its
 * check holds. A list's `labels` are its read's screened `readRows.rows`, when
 * it answered them: label n names row n.
 */
export type AutomationStudioFlowDraftReplaySpanPlan =
  | { kind: "list"; members: AutomationStudioFlowDraftStep[]; over: AutomationStudioFlowDraftStep; rows: JsonObject[]; labels?: readonly string[] }
  | { kind: "while"; members: AutomationStudioFlowDraftStep[]; over: AutomationStudioFlowDraftStep };

/** How many passes one span may take: the bound the executor's For Each applies when the assembler sets none. */
export function automationStudioFlowDraftReplayLoopBound(): number {
  const bound = getAutomationNodeDefinition(FOR_EACH_NODE_ID)?.parameters.find((parameter) => parameter.id === "maxIterations")?.defaultValue;
  return typeof bound === "number" && Number.isInteger(bound) && bound > 0 ? bound : 100;
}

/**
 * The repeat that starts at `run[index]`, planned, or nothing when it is not
 * one the test can run as a loop (see the header). `asked` is what this walk
 * already asked a step, and how.
 */
export function automationStudioFlowDraftReplaySpanPlan(input: {
  steps: readonly AutomationStudioFlowDraftStep[];
  run: readonly AutomationStudioFlowDraftStep[];
  index: number;
  nodeOf?: AutomationStudioFlowDraftReplayNodeOf | undefined;
  asked(step: AutomationStudioFlowDraftStep): { answer: AutomationStudioFlowDraftReplayAnswer; mode: AutomationStudioFlowDraftReplayMode } | undefined;
}): AutomationStudioFlowDraftReplaySpanPlan | undefined {
  const first = input.run[input.index];
  const routing = first?.routing;
  if (!first || routing?.kind !== "repeat" || !input.nodeOf) return undefined;
  const over = input.run.slice(0, input.index).find((candidate) => automationStudioFlowDraftStepId(candidate) === routing.over);
  const asked = over ? input.asked(over) : undefined;
  if (!over || !asked || asked.mode !== "replay" || !asked.answer.readable) return undefined;
  const node = input.nodeOf(over.actionId);
  if (!node) return undefined;
  const members = spanMembers(input.steps, input.run, input.index, routing.through);
  const port = node.outputs.find((output) => output.type === "array")?.id;
  // A check is asked again on every pass, so the assembler puts it right before the span.
  if (port === undefined) return input.run[input.index - 1] === over ? { kind: "while", members, over } : undefined;
  if (automationStudioNodeReplayStatus(asked.answer.result.resultCode, "replay") !== "replayed") return undefined;
  const rows = asked.answer.result.outputs?.[port];
  if (!Array.isArray(rows) || !rows.every(isRecord)) return undefined;
  const labels = rowLabels(asked.answer.result.evidence);
  return { kind: "list", members, over, rows, ...(labels ? { labels } : {}) };
}

/**
 * The labels of the rows a list read answered, one per row in its order, each
 * screened by the check the build-test judge's `readRows.rows` labels pass
 * (`screenAutomationStudioLlmEvidence` on `{ column: label }`, in
 * `../../result-verification/read-account/alone-rows.ts`), no denied column
 * known here: a credential-shaped label is written `(withheld)`. Only the
 * label cell; a row's other cells are never read. Nothing when it named none.
 */
function rowLabels(evidence: JsonValue): readonly string[] | undefined {
  const named = isRecord(evidence) ? evidence[READ_ROWS_KEY] : undefined;
  const rows = isRecord(named) ? named.rows : undefined;
  if (!Array.isArray(rows) || rows.length === 0) return undefined;
  const labels: string[] = [];
  for (const row of rows) {
    const cell = isRecord(row) ? Object.entries(row)[0] : undefined;
    if (cell === undefined || typeof cell[1] !== "string") continue;
    const found = screenAutomationStudioLlmEvidence({ [cell[0]]: cell[1] }, []);
    labels.push(found.deniedKey || found.secretShaped ? WITHHELD_LABEL : cell[1]);
  }
  return labels.length ? labels : undefined;
}

/**
 * The members of the span starting at `run[index]`, in order: the draft's
 * proposed steps from it through `through` (`../../flow-draft/routing.ts`),
 * those of them this walk runs, contiguous from `index`. Just the first when
 * `through` does not come after it.
 */
function spanMembers(steps: readonly AutomationStudioFlowDraftStep[], run: readonly AutomationStudioFlowDraftStep[], index: number, through: string): AutomationStudioFlowDraftStep[] {
  const first = run[index]!;
  const start = steps.indexOf(first);
  const end = steps.findIndex((candidate) => automationStudioFlowDraftStepId(candidate) === through);
  const ids = new Set(start < 0 || end < start ? [automationStudioFlowDraftStepId(first)] : steps.slice(start, end + 1).map(automationStudioFlowDraftStepId));
  const members: AutomationStudioFlowDraftStep[] = [];
  for (const step of run.slice(index)) {
    if (!ids.has(automationStudioFlowDraftStepId(step))) break;
    members.push(step);
  }
  return members;
}

/** Whether a node takes the row a pass is on: it declares the input a For Each hands the row to. */
export function automationStudioFlowDraftReplayTakesRow(node: AutomationStudioFlowDraftReplayNode | undefined): boolean {
  return node?.inputs.some((input) => input.id === AUTOMATION_STUDIO_NODE_REPLAY_ITEM_KEY) === true;
}

/** A step's outputs in this test, only when it was asked to run and ran: a step checked, remembered or failed produced nothing. */
export function automationStudioFlowDraftReplayProduced(answer: AutomationStudioFlowDraftReplayAnswer, mode: AutomationStudioFlowDraftReplayMode): JsonObject | undefined {
  if (!answer.readable || mode !== "replay" || answer.result.resultCode !== AUTOMATION_STUDIO_NODE_REPLAY_RESULT_CODES.replayed) return undefined;
  const outputs = answer.result.outputs;
  return isRecord(outputs) ? outputs : undefined;
}

/**
 * The call one step is sent with: its bindings resolved against `{item: row}`
 * on a pass of a list, so an input takes its test value, and against
 * `earlier`, what earlier steps produced in this test; the row under `item`
 * when the node takes it, and then no `produced`, which describes the
 * explored row. `unresolved` names the paths nothing answered; nothing is
 * sent then. Nothing at all for a step with nothing to run it with.
 */
export function automationStudioFlowDraftReplayPassCall(
  step: AutomationStudioFlowDraftStep,
  mode: AutomationStudioFlowDraftReplayMode,
  row?: { item: JsonObject; takesRow: boolean },
  node?: AutomationStudioFlowDraftReplayNode,
  earlier?: Record<string, JsonValue>
): { value: JsonObject } | { unresolved: string[] } | undefined {
  const scheduled = automationStudioFlowDraftScheduledCandidateCall(step);
  if (step.scheduledCandidate !== undefined && (!scheduled || !node?.outputAction?.fixed)) return undefined;
  const parameters = (scheduled?.input ?? step.ranWith)?.parameters;
  const pass: AutomationStudioNodeReplayPass = {};
  if (isRecord(parameters) && automationStudioFlowDraftHoldsBinding(parameters)) {
    const resolved = resolveAutomationNodeParameterValues(parameters, { ...(earlier ?? {}), ...(row ? { item: row.item } : {}) });
    if (resolved.missingPaths.length) return { unresolved: resolved.missingPaths };
    pass.parameters = resolved.values;
  }
  if (row?.takesRow) pass.item = row.item;
  const value = mode === "verify" ? automationStudioNodeReplayVerifyCall(step, pass) : automationStudioNodeReplayStepCall(step, pass);
  if (!value) return undefined;
  if (pass.item !== undefined) delete value.produced;
  return { value };
}

/** What running a span needs from the walker that found it. */
export type AutomationStudioFlowDraftReplaySpanRunInput = {
  plan: AutomationStudioFlowDraftReplaySpanPlan;
  nodeOf: AutomationStudioFlowDraftReplayNodeOf;
  modeOf(step: AutomationStudioFlowDraftStep): AutomationStudioFlowDraftReplayMode;
  callIdOf(step: AutomationStudioFlowDraftStep): string;
  send(callId: string, step: AutomationStudioFlowDraftStep, value: JsonObject): Promise<AutomationStudioFlowDraftReplayAnswer>;
  /** Whether a member with a pass that did not pass ends the whole walk there (a part run). Absent, every pass runs. */
  stops?: ((step: AutomationStudioFlowDraftStep) => boolean) | undefined;
  /** The verified step before the span whose withheld effect a member may have needed (`../../flow-draft/verify-only.ts`). */
  withheldBy?: number | undefined;
  /** What the steps before the span really produced in this test, as run state (see the header). */
  earlier?: Record<string, JsonValue> | undefined;
};

/** What a span answered: an outcome per member that ran, what the calls showed, the first page that did not pass, and whether the walk stops. */
export type AutomationStudioFlowDraftReplaySpanRunResult = {
  outcomes: AutomationStudioFlowDraftReplayOutcome[];
  observations: AutomationStudioFlowDraftReplayObservation[];
  evidence?: { callId: string; toolId: string; value: JsonValue };
  stopped: boolean;
};

/** Run a planned span, pass by pass (see the header). */
export async function automationStudioFlowDraftReplaySpanRun(input: AutomationStudioFlowDraftReplaySpanRunInput): Promise<AutomationStudioFlowDraftReplaySpanRunResult> {
  const { plan } = input;
  const bound = automationStudioFlowDraftReplayLoopBound();
  const passes = new Map<AutomationStudioFlowDraftStep, AutomationStudioFlowDraftReplayPass[]>(plan.members.map((member) => [member, []]));
  const observations: AutomationStudioFlowDraftReplayObservation[] = [];
  let evidence: AutomationStudioFlowDraftReplaySpanRunResult["evidence"];
  let stopped = false;
  let overBound = false;
  let count = 0;
  const observe = (step: AutomationStudioFlowDraftStep, callId: string, answer: AutomationStudioFlowDraftReplayAnswer, status: AutomationStudioFlowDraftReplayPass["status"], pass: number): void => {
    if (!answer.readable) return;
    observations.push({ step: step.position, stepId: automationStudioFlowDraftStepId(step), ...(answer.result.resultCode ? { resultCode: answer.result.resultCode } : {}), evidence: answer.result.evidence, pass });
    if (status !== "replayed" && !evidence) evidence = { callId, toolId: automationStudioNodeReplayToolId(step), value: answer.result.evidence };
  };
  // A call of pass `pass`, sent inside its step-log pass scope (see the header).
  const sendPass = (pass: number, callId: string, step: AutomationStudioFlowDraftStep, value: JsonObject): Promise<AutomationStudioFlowDraftReplayAnswer> => {
    const label = plan.kind === "list" ? plan.labels?.[pass - 1] : undefined;
    const of = plan.kind === "list" ? plan.rows.length : undefined;
    return automationStudioLlmStepLogScope.pass({ pass, ...(of !== undefined ? { of } : {}), ...(label !== undefined ? { row: label } : {}) }, () => input.send(callId, step, value));
  };
  // One pass of every member, on `row` for a list. True when the walk stops.
  const runPass = async (pass: number, row?: JsonObject): Promise<boolean> => {
    // What the members before this one produced on this pass, and nothing of the pass before.
    const produced = new Map<string, JsonObject>();
    for (const member of plan.members) {
      const mode = input.modeOf(member);
      const earlier = { ...(input.earlier ?? {}), ...automationStudioFlowDraftStepOutputsState(produced) };
      const built = automationStudioFlowDraftReplayPassCall(member, mode, row ? { item: row, takesRow: automationStudioFlowDraftReplayTakesRow(input.nodeOf(member.actionId)) } : undefined, input.nodeOf(member.actionId), earlier);
      let answered: AutomationStudioFlowDraftReplayPass;
      if (built && "unresolved" in built) answered = { pass, status: "failed", resultCode: AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_UNRESOLVED_BINDING_CODE };
      else {
        const callId = `${input.callIdOf(member)}.pass.${pass}`;
        const answer: AutomationStudioFlowDraftReplayAnswer = built ? await sendPass(pass, callId, member, built.value) : { readable: false };
        const status = answer.readable ? automationStudioNodeReplayStatus(answer.result.resultCode, mode) : "failed";
        answered = { pass, status, ...(answer.readable && answer.result.resultCode ? { resultCode: answer.result.resultCode } : {}) };
        observe(member, callId, answer, status, pass);
        const outputs = automationStudioFlowDraftReplayProduced(answer, mode);
        if (outputs) produced.set(automationStudioFlowDraftStepId(member), outputs);
      }
      passes.get(member)!.push(answered);
      if (answered.status !== "replayed" && input.stops?.(member)) return true;
    }
    return false;
  };
  if (plan.kind === "list") {
    overBound = plan.rows.length > bound;
    for (const [at, row] of (overBound ? [] : plan.rows).entries()) {
      count = at + 1;
      if (await runPass(count, row)) { stopped = true; break; }
    }
  } else {
    // The check was asked on its own line just before this, and holds: the walker planned this span only on its answer.
    const checkMode = input.modeOf(plan.over);
    // A body the test only checks never does what would end the loop, so it runs once.
    const once = plan.members.some((member) => input.modeOf(member) === "verify");
    let holds = true;
    while (holds) {
      if (count >= bound) { overBound = true; break; }
      count += 1;
      if (await runPass(count)) { stopped = true; break; }
      if (once) break;
      const built = automationStudioFlowDraftReplayPassCall(plan.over, checkMode, undefined, undefined, input.earlier);
      if (!built || "unresolved" in built) break;
      const callId = `${input.callIdOf(plan.over)}.pass.${count + 1}`;
      const answer = await sendPass(count + 1, callId, plan.over, built.value);
      holds = answer.readable && automationStudioNodeReplayStatus(answer.result.resultCode, checkMode) === "replayed";
      // The answer that ends the loop is the loop ending, not a step failing.
      observe(plan.over, callId, answer, "replayed", count + 1);
    }
  }
  for (const observation of observations) observation.of = count;
  const outcomes: AutomationStudioFlowDraftReplayOutcome[] = [];
  for (const member of plan.members) {
    const list = passes.get(member)!;
    // A walk that stopped before a member ran leaves it without an outcome, as a straight step after a stop has none.
    if (stopped && !list.length) continue;
    outcomes.push(memberOutcome(member, list, input.modeOf(member), overBound, input.withheldBy));
  }
  return { outcomes, observations, ...(evidence ? { evidence } : {}), stopped };
}

/** One member's outcome from its passes: its first pass that did not pass, else `replayed` (see the header). */
function memberOutcome(
  step: AutomationStudioFlowDraftStep,
  passes: AutomationStudioFlowDraftReplayPass[],
  mode: AutomationStudioFlowDraftReplayMode,
  overBound: boolean,
  withheldBy: number | undefined
): AutomationStudioFlowDraftReplayOutcome {
  const blocking = passes.find((pass) => pass.status !== "replayed");
  const status = overBound ? "failed" : blocking?.status ?? "replayed";
  const resultCode = overBound ? AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_LOOP_BOUND_CODE : (blocking ?? passes[0])?.resultCode;
  return {
    step: step.position,
    stepId: automationStudioFlowDraftStepId(step),
    actionId: step.actionId,
    status,
    ...(resultCode ? { resultCode } : {}),
    ...(mode === "verify" ? { mode } : {}),
    ...(status !== "replayed" && withheldBy !== undefined ? { withheldBy, excused: "withheld" as const } : {}),
    passes
  };
}

function isRecord(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
