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
// **What it does not do.** A matching step keeps nothing the first press produced, since
// the record holds no page values: a later step bound to its output finds none, and says
// so by failing before it acts. A match excuses every matching dispatch of this one run:
// a step that really means to press the same control on each pass of a row-less repeat
// presses none of them on this run. Doing too little is what a judge sees; doing it twice
// is what nobody can take back.

import type { AutomationStudioAttemptAct } from "@fluxiq/contracts/automation";
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioAttemptActRecord } from "../../../../../runtime/answer-first/act-record/index.ts";
import { emitAutomationStudioActivityStepSkipped } from "../../../../../runtime/automation-activity/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../../../executor/index.ts";

/** Where a node a build wrote keeps its plan key (`flow-bootstrap/adaptation.ts`). */
const SYMBOLIC_KEY_METADATA = "bootstrapSymbolicKey";
const POLICY_OUTPUT_EFFECT = "policy.output.dispatch";
/** The port a loop hands its current row to (`engine/.../zero-pass-loop.ts`). */
const ROW_PORT = "item";

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
}): AutomationStudioGraphExecutionOptions {
  const { record } = input;
  /** The attempt just answered without dispatching, whose effect check is answered `seen` (header). */
  let skipped = false;
  /** How many outputs an admitted native node has left to dispatch, uncompared (header). */
  let admitted = 0;
  const gated: AutomationStudioGraphExecutionOptions = { ...options };
  const native = options.nativeNodeExecutor;
  if (native) gated.nativeNodeExecutor = (async (request) => {
    skipped = false;
    const row = rowOf(request.inputs[ROW_PORT]);
    const act = record.carried({ actionId: request.node.definitionId, parameters: asParameters(request.node.parameterValues), row, steps: stepNames(request.node) });
    if (!act) {
      const execution = await native(request);
      admitted = (execution?.result.effects ?? []).filter((effect) => effect.type === POLICY_OUTPUT_EFFECT).length;
      return execution;
    }
    skipped = true;
    admitted = 0;
    const label = request.node.label?.trim();
    told(request.node.id, label || act.what);
    return { result: skippedResult(label || act.what, act) };
  }) as Native;
  const dispatcher = options.effectDispatcher;
  if (dispatcher) gated.effectDispatcher = (async (effect, context) => {
    skipped = false;
    if (admitted > 0 && effect.type === POLICY_OUTPUT_EFFECT) {
      admitted -= 1;
      return await dispatcher(effect, context);
    }
    const payload = effect.type === POLICY_OUTPUT_EFFECT ? recordOf(effect.payload) : undefined;
    const outputId = payload && typeof payload.outputId === "string" ? payload.outputId : undefined;
    if (!payload || !outputId) return await dispatcher(effect, context);
    const parameters = asParameters(recordOf(payload.parameters) ?? {});
    const act = [outputId, ...(input.definitions?.() ?? []).filter((definition) => definition.outputAction?.fixedOutputId === outputId || definition.outputAction?.allowedOutputIds?.includes(outputId)).map((definition) => definition.id)]
      .map((actionId) => record.carried({ actionId, parameters })).find((found) => found !== undefined);
    if (!act) return await dispatcher(effect, context);
    skipped = true;
    told(outputId, act.what);
    return skippedResult(act.what, act);
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

function skippedResult(subject: string, act: AutomationStudioAttemptAct): { status: "success"; route: string; outputs: Record<string, JsonValue>; effects: []; message: string } {
  const may = act.state === "may_have_landed" ? "may already have happened" : "already happened";
  return { status: "success", route: "success", outputs: {}, effects: [], message: `Already done: ${subject}: it ${may} while the task was being worked out, so this run did not do it again.` };
}

/** The names a Flow step goes by across a revision (`./mergers/from-trial-ledger.ts`). */
function stepNames(node: { id: string; metadata?: Record<string, unknown> | undefined }): string[] {
  const key = node.metadata?.[SYMBOLIC_KEY_METADATA];
  return [`node:${node.id}`, ...(typeof key === "string" && key ? [`step:${key}`] : [])];
}

function rowOf(value: JsonValue | undefined): JsonObject | undefined {
  return recordOf(value);
}

function recordOf(value: JsonValue | undefined): JsonObject | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : undefined;
}

function asParameters(value: Record<string, JsonValue> | undefined): JsonObject {
  return (value ?? {}) as JsonObject;
}
