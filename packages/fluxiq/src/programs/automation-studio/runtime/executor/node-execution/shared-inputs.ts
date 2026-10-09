import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioGraphExecutionTrace, AutomationStudioNodeAttemptTrace } from "../contracts.ts";
import { automationStudioAttemptInputs } from "./attempt-inputs.ts";

// Each value a saved trace holds, held once (t377).
//
// An attempt's `inputs` are every value the run held when its node executed
// (`../node-inputs.ts`), and the run holds every output of every step before it,
// a web step's page snapshot with its interactive elements included. Copying
// that whole map onto each attempt costs nothing in memory -- the copies share
// their values -- but a saved trace is serialized, and there each copy is
// written out again: the trace grows with the square of its steps. Lane A round
// 8's trial sessions were 10-15 MB each, 10.9 MB of one 15.2 MB session in
// `attempts[].inputs` (per-attempt inputs grew 0, 2, 199, 299 ... 1,136 KB over
// 19 attempts), and every Flow listing parsed them all.
//
// So the saved trace keeps, on each attempt after the first, only what changed
// since the attempt before it (`inputsSince`): a value an earlier attempt keeps
// in its `outputs` -- which is where nearly every changed value comes from -- is
// named there, and anything else is kept in `inputs` as before. What is shared
// is proved by identity, never by likeness: the executed trace's values are the
// very objects the attempts' outputs hold, and a value that is not the same
// object (or the same long text) stays where it was. So the rewrite is exact by
// construction, `automationStudioAttemptInputs` reads back the inputs the
// attempt was executed with, and a trace with nothing to share is handed back as
// it came.
//
// It runs on the executed trace before rows become markers and before resolved
// values are withheld (`../graph-run.ts`), while identity still holds, and adds
// no value of its own, so those rewrites reach a shared value where its earlier
// attempt keeps it, as they reached each copy.

/** A text shorter than this is kept where it is: naming where it is kept costs about as much. */
const SHARED_TEXT_MIN_LENGTH = 128;

/** The saved trace with each value its attempts' `inputs` held kept once (see above). */
export function automationStudioTraceWithSharedInputs(trace: AutomationStudioGraphExecutionTrace, runInputs: Record<string, JsonValue>): AutomationStudioGraphExecutionTrace {
  if (trace.attempts.length < 2) return trace;
  // Where each shareable value is kept, by the object itself (or the text): the
  // latest attempt whose outputs hold it, and under which key.
  const keptAt = new Map<unknown, { index: number; output: string }>();
  // The latest attempt with each id, which is the one a reader finds first
  // walking back (`attempt-inputs.ts`).
  const latestById = new Map<string, number>();
  const attempts: AutomationStudioNodeAttemptTrace[] = [];
  let previous: Record<string, JsonValue> | undefined;
  let changed = false;
  for (const [index, attempt] of trace.attempts.entries()) {
    const kept = attempt.inputsSince || !previous ? attempt : attemptWithInputsSince(attempt, previous, attempts[index - 1]!.attemptId, runInputs, keptAt, latestById, attempts);
    if (kept !== attempt) changed = true;
    attempts.push(kept);
    // An attempt saved earlier -- a resumed run's first part -- is kept as it
    // was; what it saw is read back so the next attempt can be told apart from it.
    previous = attempt.inputsSince ? automationStudioAttemptInputs(attempts, index) : attempt.inputs;
    for (const [output, value] of Object.entries(attempt.outputs)) if (shareable(value)) keptAt.set(value, { index, output });
    latestById.set(attempt.attemptId, index);
  }
  return changed ? { ...trace, attempts } : trace;
}

function attemptWithInputsSince(
  attempt: AutomationStudioNodeAttemptTrace,
  previous: Record<string, JsonValue>,
  previousAttemptId: string,
  runInputs: Record<string, JsonValue>,
  keptAt: ReadonlyMap<unknown, { index: number; output: string }>,
  latestById: ReadonlyMap<string, number>,
  attempts: readonly AutomationStudioNodeAttemptTrace[]
): AutomationStudioNodeAttemptTrace {
  const inputs: Record<string, JsonValue> = {};
  const shared: Array<{ input: string; attemptId: string; output: string }> = [];
  for (const [key, value] of Object.entries(attempt.inputs)) {
    if (Object.hasOwn(previous, key) && previous[key] === value) continue;
    const source = sharedSource(key, value, runInputs, keptAt, latestById, attempts);
    if (source) shared.push({ input: key, attemptId: source.attemptId, output: source.output });
    else inputs[key] = value;
  }
  const removed = Object.keys(previous).filter((key) => !Object.hasOwn(attempt.inputs, key));
  return {
    ...attempt,
    inputs,
    inputsSince: { attemptId: previousAttemptId, ...(shared.length ? { shared } : {}), ...(removed.length ? { removed } : {}) }
  };
}

function sharedSource(
  key: string,
  value: JsonValue,
  runInputs: Record<string, JsonValue>,
  keptAt: ReadonlyMap<unknown, { index: number; output: string }>,
  latestById: ReadonlyMap<string, number>,
  attempts: readonly AutomationStudioNodeAttemptTrace[]
): { attemptId: string; output: string } | undefined {
  // A run input still at its own key stays there: the saved trace withholds it
  // by position (`automationStudioWithholdRunInputs`), whole and however deep.
  if (!shareable(value) || (Object.hasOwn(runInputs, key) && runInputs[key] === value)) return undefined;
  const kept = keptAt.get(value);
  const source = kept ? attempts[kept.index] : undefined;
  // Named only where a reader walking back finds that very attempt by its id.
  if (!kept || !source || latestById.get(source.attemptId) !== kept.index || source.outputs[kept.output] !== value) return undefined;
  return { attemptId: source.attemptId, output: kept.output };
}

/** A value worth naming rather than copying: a non-empty object or list, or a long text. */
function shareable(value: JsonValue | undefined): boolean {
  if (typeof value === "string") return value.length >= SHARED_TEXT_MIN_LENGTH;
  if (!value || typeof value !== "object") return false;
  return Array.isArray(value) ? value.length > 0 : Object.keys(value).length > 0;
}
