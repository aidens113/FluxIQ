// The act record's gate on a real Flow run (t861; plan D6: a lasting act must never be
// repeated, and the Flow an attempt saved is about to run from the top).
//
// **Where real acts go.** Two doors, and both are wrapped (`attempt.ts`):
//
//   `nativeNodeExecutor`  an importer's node, which is how a web step runs. The door
//                         that sees the node, its resolved parameters and its row.
//   `effectDispatcher`    the output a node emits. A node of Core's own
//                         (`builtin.policy.action`) reaches the world only here, with no
//                         node and no row in hand, so it is compared by output and
//                         parameters. A native node that was admitted goes through
//                         uncompared: it was compared with its row, and it has no row here.
//
// **What a match does.** The act is not dispatched, the attempt reads success through its
// own `success` route, and the chat is told a step was not done again. This cannot go
// through the engine's own skip, which reads its own run's ledger, and the engine is not
// this lane's. What it does reach is the attempt's end: a lasting step's recorded effect
// is checked after it answers (`engine/.../recorded-effect.ts`), and that check would
// fail a step that pressed nothing if its effect is not on the page in hand. So the host
// is asked once for that attempt and answers `seen`. A step's own `done when:` is still
// read, as it should be: it asks about the page.
//
// **What follows a step not done again.** It says `skipped: "already_done"` among its outputs, the
// engine's closed word for a step that sent nothing because its act was done. Every act this gate
// refuses is one the record holds as having changed something that stays: declared or claimed, or a
// press that declared nothing but whose answer said it changed something that stays, held on repeat
// (`runtime/answer-first/act-record/seed.ts`). A press that only moved the view is never carried, so
// it is never refused here and is pressed as often as the Flow says. So each act refused here brought
// about a state of its own, and the steps written on the page it brings about (the drawer an Add
// opens, the page a dialog's Done goes to) find that page never came: the run passes over each one
// whose control is missing and that does no lasting act, instead of stopping on it
// (`engine/automation/state-routing/not-arisen.ts`). Until t897 a refused press with no class of its
// own said nothing, as if it only removed a cover, so a held press's follow-on step failed on its
// missing control and the attempt explored from there (`run-mwb5cnxg-003415b4`). That run's held press
// was a composer's prompt the record should never have held: the press closed one dialog and opened
// another on the same handles, and the domain read that as a line that now reads otherwise. How
// precisely a press is held is the act record's reading (`act-record/gate/read-answer.ts`) of what the
// domain states; this gate trusts it.
//
// **What it does not do.** A matching step keeps nothing the first press produced, since
// the record holds no page values: a later step bound to its output finds none, and says
// so by failing before it acts. A match excuses every matching dispatch of this one run:
// a step that really means to press the same control on each pass of a row-less repeat
// presses none of them on this run. Doing too little is what a judge sees; doing it twice
// is what nobody can take back.
//
// **`settle: true` (t870): the attempt's own run of its saved Flow.** The run is part of the
// attempt, so what it does goes on the attempt's record as it happens (`./settling.ts`), at
// stage "run", and each pass is compared with all of that, earlier passes of this run
// among them: a row pressed once is refused if it comes round again. A lasting act is on the
// persisted record before it is sent, at both doors. Without it, this gate is as it was above.
//
// **A repeat over a step with no row, under `settle`.** Each pass of a do-while presses the
// same control with nothing to tell the passes apart, and only the person's own words say how
// many are wanted. So it presses as many times as the request asks (`asked`, in the record:
// "add 3" presses three times, and a repeat of five still presses three), and without a count
// it presses once. The Flow's repeat count does not raise it, since a model wrote that, and
// the record's rule is that nothing a model says raises a count. The refused passes read
// success and go on; the judge then sees too little, says no, and rounds look for another
// way. The engine's own ledger counts each do-while pass as a new act, and it may: it has no
// by-hand press or earlier attempt to compare with, and this gate does. This is of a step that
// says it lasts (`./settling.ts`). A plain press with nothing declared or claimed is pressed each
// pass the Flow says, and so is a second step pressing the same plain control: a next page, an
// Apply a page swallowed the first time (t869).
//
// **A row left behind (t869).** The page says when a pass's press went as a page-level link, so that nothing says the
// pass still stands on its row. Under `settle`, that pass's next lasting step fails as a target not found, with nothing
// sent, and a run reads that as any failing step. A press the row placed takes it back, and so does the next row.
//
// **A For Each's row that is no object** (a list of plain values) is that pass's row all the
// same under `settle`, held as `{ item: value }`, so its passes stay apart. Without `settle` a
// row is an object only, as it always was.

import type { AutomationStudioAttemptAct } from "@fluxiq/contracts/automation";
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationNodeExecutionResult } from "../../../../../components/automation/index.ts";
import type { AutomationStudioAttemptActRecord } from "../../../../../runtime/answer-first/act-record/index.ts";
import { emitAutomationStudioActivityStepSkipped } from "../../../../../runtime/automation-activity/index.ts";
import { AUTOMATION_STUDIO_ALREADY_DONE_OUTPUT, type AutomationStudioGraphExecutionOptions } from "../../../executor/index.ts";
import { automationStudioAnswerFirstRunActSettling } from "./settling.ts";

/** Where a node a build wrote keeps its plan key (`flow-bootstrap/adaptation.ts`). */
const SYMBOLIC_KEY_METADATA = "bootstrapSymbolicKey";
const POLICY_OUTPUT_EFFECT = "policy.output.dispatch";
/** The port a loop hands its current row to (`engine/.../zero-pass-loop.ts`). */
const ROW_PORT = "item";
const ROW_LEFT_BEHIND_CODE = "answer_first.row_left_behind";
const ROW_LEFT_BEHIND_SAID = "This step was not done, because the step before it went by a link not shown to be this row's, so nothing says the page is this row's.";
const NOT_RECORDED_CODE = "answer_first.act_not_recorded";
const NOT_RECORDED_SAID = "This step was not done, because the record of what this task did could not be saved first. Nothing was sent.";

type Native = NonNullable<AutomationStudioGraphExecutionOptions["nativeNodeExecutor"]>;
type Dispatcher = NonNullable<AutomationStudioGraphExecutionOptions["effectDispatcher"]>;
type Host = NonNullable<AutomationStudioGraphExecutionOptions["hostRuntime"]>;

/**
 * `options` with every door the run has gated by `record` (header). A definition's
 * output is compared under every node id that fixes it, since an act is recorded under
 * the node that made it. `definitions` names them.
 */
export function automationStudioAnswerFirstRunActGate(options: AutomationStudioGraphExecutionOptions, input: {
  record: AutomationStudioAttemptActRecord;
  definitions?: () => ReadonlyArray<{ id: string; outputAction?: { fixedOutputId?: string; allowedOutputIds?: string[] } }>;
  /** Record what this run does into `record` as it happens, and compare each pass with that too (header). */
  settle?: boolean;
  /** The plan keys whose draft step claims a lasting act the person asked for (`../flow-run/act-claims.ts`): such a press lasts, whatever it declared. */
  claimedActs?: ReadonlySet<string> | undefined;
}): AutomationStudioGraphExecutionOptions {
  const { record, claimedActs } = input;
  const claimsAct = (node: { metadata?: Record<string, unknown> | undefined }): boolean => {
    const key = node.metadata?.[SYMBOLIC_KEY_METADATA];
    return typeof key === "string" && claimedActs?.has(key) === true;
  };
  const settling = input.settle === true ? automationStudioAnswerFirstRunActSettling(record, { claimsAct }) : undefined;
  const counted = settling ? { counted: true } : {};
  /** The attempt just answered without dispatching, whose effect check is answered `seen` (header). */
  let skipped = false;
  /** How many outputs an admitted native node has left to dispatch, uncompared (header). */
  let admitted = 0;
  /** The pass whose row a page-level link left behind (header), and the pass a dispatch now answers for. */
  let leftBehind: string | undefined;
  let passing: string | undefined;
  const gated: AutomationStudioGraphExecutionOptions = { ...options };
  const native = options.nativeNodeExecutor;
  const dispatcher = options.effectDispatcher;
  if (settling) gated.resolveActionEffect = (node, parameterValues) => {
    settling.sawNode(node);
    return options.resolveActionEffect?.(node, parameterValues);
  };
  if (native) gated.nativeNodeExecutor = (async (request) => {
    skipped = false;
    const row = settling ? passRowOf(request.inputs[ROW_PORT]) : rowOf(request.inputs[ROW_PORT]);
    const parameters = asParameters(request.node.parameterValues);
    const act = record.carried({ actionId: request.node.definitionId, parameters, row, steps: stepNames(request.node), ...counted });
    if (!act) {
      if (settling) {
        const step = settling.stepOf({ node: request.node, actionId: request.node.definitionId, parameters, row, floor: options.resolveActionEffect?.(request.node, request.node.parameterValues) });
        passing = row === undefined ? undefined : JSON.stringify(row);
        if ((step.lasting || step.plainPress) && passing !== undefined && passing === leftBehind) {
          admitted = 0;
          return { result: rowLeftBehind() };
        }
        if (await settling.begin(step) === "not_written") {
          admitted = 0;
          return { result: notRecorded() };
        }
        let execution: Awaited<ReturnType<Native>>;
        try {
          execution = await native(request);
        } catch (error) {
          settling.threw(step);
          throw error;
        }
        admitted = (execution?.result.effects ?? []).filter((effect) => effect.type === POLICY_OUTPUT_EFFECT).length;
        settling.nodeAnswered(step, execution?.result, dispatcher ? admitted : 0);
        return execution;
      }
      const execution = await native(request);
      admitted = (execution?.result.effects ?? []).filter((effect) => effect.type === POLICY_OUTPUT_EFFECT).length;
      return execution;
    }
    skipped = true;
    admitted = 0;
    const label = request.node.label?.trim();
    told(request.node.id, label || act.what);
    return { result: skippedResult(label || act.what, act, settling !== undefined) };
  }) as Native;
  if (dispatcher) gated.effectDispatcher = (async (effect, context) => {
    skipped = false;
    if (admitted > 0 && effect.type === POLICY_OUTPUT_EFFECT) {
      admitted -= 1;
      if (!settling) return await dispatcher(effect, context);
      const answer = await settling.outputSent(async () => await dispatcher(effect, context));
      const passRow = saidOfThePassRow(answer);
      if (passRow === "page-level-link") leftBehind = passing;
      else if (passRow === "own") leftBehind = undefined;
      // The engine sends no more of this node's outputs after one that failed.
      if (answer?.status === "failed") admitted = 0;
      return answer;
    }
    const payload = effect.type === POLICY_OUTPUT_EFFECT ? recordOf(effect.payload) : undefined;
    const outputId = payload && typeof payload.outputId === "string" ? payload.outputId : undefined;
    if (!payload || !outputId) return await dispatcher(effect, context);
    const parameters = asParameters(recordOf(payload.parameters) ?? {});
    const act = [outputId, ...(input.definitions?.() ?? []).filter((definition) => definition.outputAction?.fixedOutputId === outputId || definition.outputAction?.allowedOutputIds?.includes(outputId)).map((definition) => definition.id)]
      .map((actionId) => record.carried({ actionId, parameters, ...counted })).find((found) => found !== undefined);
    if (!act) {
      if (!settling) return await dispatcher(effect, context);
      const step = settling.stepOf({ actionId: outputId, parameters });
      if (await settling.begin(step) === "not_written") return notRecorded();
      return await settling.coreSent(step, async () => await dispatcher(effect, context));
    }
    skipped = true;
    told(outputId, act.what);
    return skippedResult(act.what, act, settling !== undefined);
  }) as Dispatcher;
  const host = options.hostRuntime;
  if (host?.routeEffectSeen) {
    gated.hostRuntime = new Proxy(host, {
      get(target, property) {
        if (property === "routeEffectSeen") return (effect: JsonObject, observed: JsonObject) => {
          if (!skipped) return target.routeEffectSeen!(effect, observed);
          skipped = false;
          return "seen";
        };
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      }
    }) as Host;
  }
  return gated;
}

/** The chat's step: it was not done again. */
function told(ref: string, subject: string): void {
  emitAutomationStudioActivityStepSkipped({ nodeId: ref, said: `Already done: ${subject}`, skipped: { reason: "already_done", subject } });
}

/** A step not done again says it sent nothing because its act was done (header, "What follows a step not done again"). */
function skippedResult(subject: string, act: AutomationStudioAttemptAct, inTheAttempt: boolean): { status: "success"; route: string; outputs: Record<string, JsonValue>; effects: []; message: string } {
  const may = act.state === "may_have_landed" ? "may already have happened" : "already happened";
  return { status: "success", route: "success", outputs: { skipped: AUTOMATION_STUDIO_ALREADY_DONE_OUTPUT }, effects: [], message: `Already done: ${subject}: it ${may} ${inTheAttempt ? "earlier in this task" : "while the task was being worked out"}, so this run did not do it again.` };
}

/** The closed word a dispatch's answer carries of a pass's row (`domain/src/actions/types.ts`), read as its target's measurement is, wherever the answer holds it. */
function saidOfThePassRow(answer: AutomationNodeExecutionResult | undefined): unknown {
  const result = recordOf(answer?.outputs?.result);
  return (recordOf(result?.resolution) ?? recordOf(recordOf(result?.result)?.resolution))?.passRow;
}

/** The row was left behind: nothing was sent (header). */
function rowLeftBehind(): AutomationNodeExecutionResult {
  return { status: "failed", route: "failed", outputs: {}, effects: [], message: ROW_LEFT_BEHIND_SAID, failure: { category: "target_not_found", code: ROW_LEFT_BEHIND_CODE, retryable: false, stage: "target_resolution", effect: "unacted" } };
}

/** The step was refused before anything was sent: failed, as a thing that certainly did not happen, and may be tried again. */
function notRecorded(): AutomationNodeExecutionResult {
  return { status: "failed", route: "failed", outputs: {}, effects: [], message: NOT_RECORDED_SAID, failure: { category: "ambiguous_or_unknown", code: NOT_RECORDED_CODE, retryable: true, stage: "dispatch", effect: "unacted" } };
}

/** The names a Flow step goes by across a revision (`./mergers/from-trial-ledger.ts`). */
function stepNames(node: { id: string; metadata?: Record<string, unknown> | undefined }): string[] {
  const key = node.metadata?.[SYMBOLIC_KEY_METADATA];
  return [`node:${node.id}`, ...(typeof key === "string" && key ? [`step:${key}`] : [])];
}

function rowOf(value: JsonValue | undefined): JsonObject | undefined {
  return recordOf(value);
}

/** This pass's row under `settle`, a plain value among them (header). */
function passRowOf(value: JsonValue | undefined): JsonObject | undefined {
  if (value === undefined || value === null) return undefined;
  return recordOf(value) ?? { [ROW_PORT]: value };
}

function recordOf(value: JsonValue | undefined): JsonObject | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : undefined;
}

function asParameters(value: Record<string, JsonValue> | undefined): JsonObject {
  return (value ?? {}) as JsonObject;
}
