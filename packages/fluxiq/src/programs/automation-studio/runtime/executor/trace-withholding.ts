// Withholding, from the trace a run persists, every value the run resolved out
// of state.
//
// A parameter state binding -- `{ $state: { path } }`, `nodes/parameter-bindings.ts`
// -- is a *request* for a value the Flow document deliberately does not carry.
// Resolution answers it immediately before the node executes, so the value is
// supposed to exist in the executor's memory and on the dispatch path only.
//
// Until resolution reached below the top level, that held for the
// recording-derived nodes by accident rather than by design: the binding sat at
// `parameterValues.parameters.text`, was never resolved, and what travelled on
// was the request. Now the answer travels. `builtin.policy.action` copies its
// whole payload into a `policy.output.dispatch` effect, `nodeAttemptFromResult`
// copies a result's effects onto the attempt verbatim, `graph-run` pushes every
// attempt effect onto the run's effect list, and the whole trace is persisted by
// `runtime/service.ts`. A replay credential would be written to disk.
//
// Three decisions shape this module.
//
// **Safety is proved, never declared.** A value is treated as authored -- and so
// safe to persist, because the Flow document already holds it -- only when it is
// *identical* to the value the document carries at the same position.
// `resolveAutomationNodeParameterValues` returns an untouched subtree by
// reference, so identity is available and exact. Everything else is treated as
// resolution-supplied and withheld: a changed value, a key the document does not
// have, an array whose length moved, a subtree the walk cannot line up. Nothing
// marks a value as sensitive, so nothing can forget to.
//
// **Core withholds every resolved value, not the ones it guesses are secret.**
// It cannot tell a credential from a cart count: the namespace that means
// "secret" (`web.secret.`) is a downstream convention, and reading it here would
// put a domain's vocabulary in the framework and make every other namespace
// quietly safe. A value a binding supplied is run-time data of unknown
// sensitivity, and unknown is withheld.
//
// **The trace keeps its shape.** Withholding the whole effect payload would
// protect the credential and destroy the diagnostics the trace exists for, so a
// withheld value is replaced in place by `AUTOMATION_STUDIO_WITHHELD_VALUE` and
// every key, position, and sibling stays. Inside prose a withheld value is
// replaced where it sits, so "Could not type <value> into #password." still says
// what failed; the framework runtime's `fluxiqRuntimeTextWithholding` is that
// rule, and the command attempt saved for the same dispatch uses it too. The
// trace's own structure -- ids, statuses, routes, timestamps -- is not
// rewritten: replacing a `status` that happened to equal a resolved value would
// corrupt the artifact for every reader while protecting nothing, because a
// credential is not a node id.
import type { JsonValue } from "../../../../core/index.ts";
import { FLUXIQ_RUNTIME_WITHHELD_VALUE, fluxiqRuntimeTextWithholding, type FluxIQRuntimeWithheldValues } from "../../../../runtime/index.ts";
import type { AutomationNodeExecutionResult } from "../../nodes/index.ts";
import type { AutomationStudioGraphExecutionTrace } from "./contracts.ts";
import { isAutomationStudioRecordTraceMarker } from "./record-summary.ts";

/**
 * What a withheld value reads as in a persisted trace. A constant rather than a
 * removed field, so a reader can tell a value that was withheld from one that
 * was never there. It is the framework runtime's marker, so a trace and the
 * command attempts saved for its dispatches withhold alike.
 */
export const AUTOMATION_STUDIO_WITHHELD_VALUE = FLUXIQ_RUNTIME_WITHHELD_VALUE;

/**
 * Keys below which a trace carries data a producer supplied rather than
 * structure the executor owns: everything under one is withheld by value. Named
 * by key rather than by path, so the same field on a nested trace, an attempt,
 * a transition, or a log entry is covered by one entry.
 */
const TRACE_DATA_KEYS = new Set(["payload", "outputs", "inputs", "values", "expectedOutputs", "expectedState", "stateDiff", "metadata", "data"]);

/** Keys whose string is prose a producer wrote, which may quote a value it was handed. */
const TRACE_PROSE_KEYS = new Set(["message", "reason", "label", "expected", "actual"]);

/**
 * How deep the walks below descend. Resolution itself stops at 16
 * (`MAXIMUM_PARAMETER_VALUE_DEPTH`), so no supplied value sits deeper than that
 * in a parameter tree; the rest is headroom for the shape of the state value
 * that answered the binding. A trace that reached this bound would be
 * pathological, and the walk withholds such a subtree whole rather than passing
 * it through.
 */
const MAXIMUM_WITHHOLDING_DEPTH = 64;

type WithheldValues = { texts: Set<string>; numbers: Set<number> };

export type AutomationStudioTracePersistence = {
  /** Keys in the dispatched effect payload whose complete values must not be kept. */
  effectPayloadKeys?: readonly string[];
  /** Output ids whose complete values must remain on live edges only. */
  outputIds?: readonly string[];
};

type TrustedDispatch = {
  nodeId: string;
  attemptId: string;
  effectIndex: number;
  effect: { type: string; payload?: JsonValue };
  outputs: Record<string, JsonValue>;
  persistence: AutomationStudioTracePersistence;
};

// A dispatcher is trusted host code. Keeping its persistence directive outside
// the JSON result means a Flow, importer payload, or model cannot forge it.
const tracePersistenceByResult = new WeakMap<AutomationNodeExecutionResult, AutomationStudioTracePersistence>();

export function withAutomationStudioTracePersistence(
  result: AutomationNodeExecutionResult,
  persistence: AutomationStudioTracePersistence
): AutomationNodeExecutionResult {
  tracePersistenceByResult.set(result, persistence);
  return result;
}

/** The values one run resolved out of state, and the trace rewrite that withholds them. */
export type AutomationStudioTraceWithholding = {
  /**
   * Records what resolution supplied for one node, as the difference between the
   * parameter values the document authored and the ones the node executed with.
   */
  record(authored: Record<string, JsonValue>, resolved: Record<string, JsonValue>): void;
  /**
   * Records values another run has already withheld from its own trace -- a
   * Call Flow child's -- so this trace withholds them wherever they reach it.
   * The parent executes with its child's real outputs, so they can.
   */
  include(values: FluxIQRuntimeWithheldValues): void;
  /** Records a trusted dispatcher's exact effect/output persistence boundary. */
  recordDispatch(
    target: { nodeId: string; attemptId: string },
    effectIndex: number,
    effect: { type: string; payload?: JsonValue },
    result: AutomationNodeExecutionResult
  ): void;
  /**
   * The trace with every recorded value withheld. A run that resolved nothing
   * gets its own trace back by identity, so a Flow without bindings pays nothing.
   */
  apply<TTrace>(trace: TTrace): TTrace;
  /**
   * Copies of every value recorded so far, for a dispatcher to hand the
   * framework runtime, so the command attempt it saves withholds the resolved
   * values this trace withholds.
   */
  values(): FluxIQRuntimeWithheldValues;
};

export function automationStudioTraceWithholding(): AutomationStudioTraceWithholding {
  const withheld: WithheldValues = { texts: new Set<string>(), numbers: new Set<number>() };
  // Exact roots keep the complete private JSON shape out of later trace copies.
  // Objects and arrays are followed by identity; top-level booleans/null are
  // necessarily value-matched because JavaScript has no distinct primitive
  // identity. This set never leaves the run and cannot be supplied by Flow JSON.
  const privateRoots = new Set<JsonValue>();
  const dispatches: TrustedDispatch[] = [];
  return {
    record(authored, resolved) {
      recordSuppliedValue(authored, resolved, withheld, 0);
    },
    include(values) {
      for (const text of values.texts) if (text) withheld.texts.add(text);
      for (const value of values.numbers) if (Number.isFinite(value)) withheld.numbers.add(value);
    },
    recordDispatch(target, effectIndex, effect, result) {
      const persistence = tracePersistenceByResult.get(result);
      if (!persistence) return;
      for (const outputId of persistence.outputIds ?? []) {
        if (Object.hasOwn(result.outputs ?? {}, outputId)) {
          const value = result.outputs![outputId]!;
          privateRoots.add(value);
          recordWithheldScalars(value, withheld, 0);
        }
      }
      dispatches.push({ ...target, effectIndex, effect, outputs: result.outputs ?? {}, persistence });
    },
    apply<TTrace>(trace: TTrace): TTrace {
      const rooted = privateRoots.size
        ? withheldPrivateRootValue(trace, privateRoots, false, 0) as TTrace
        : trace;
      const privatelyProjected = dispatches.length
        ? withholdTrustedDispatches(rooted as AutomationStudioGraphExecutionTrace, dispatches) as TTrace
        : rooted;
      if (!withheld.texts.size && !withheld.numbers.size) return privatelyProjected;
      // The walk preserves every key and every value it does not withhold, and a
      // withheld leaf becomes a string, so the result has the shape of what it
      // was given. That is what the cast asserts and what the tests hold it to.
      return withheldTraceValue(privatelyProjected, { text: fluxiqRuntimeTextWithholding(withheld.texts), numbers: withheld.numbers }, false, 0) as TTrace;
    },
    values() {
      return { texts: [...withheld.texts], numbers: [...withheld.numbers] };
    }
  };
}

/**
 * Replaces an exact private result root wherever the live executor reused it in
 * trace data. Matching the root before descending hides object keys and every
 * nested JSON kind, including booleans and null, without guessing from leaves.
 */
function withheldPrivateRootValue(value: unknown, roots: ReadonlySet<JsonValue>, data: boolean, depth: number): unknown {
  if (data && roots.has(value as JsonValue)) return AUTOMATION_STUDIO_WITHHELD_VALUE;
  if (!value || typeof value !== "object") return value;
  if (depth >= MAXIMUM_WITHHOLDING_DEPTH) return value;
  if (Array.isArray(value)) {
    let changed = false;
    const items = value.map((item) => {
      const projected = withheldPrivateRootValue(item, roots, data, depth + 1);
      if (projected !== item) changed = true;
      return projected;
    });
    return changed ? items : value;
  }
  let changed = false;
  const record: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const projected = withheldPrivateRootValue(item, roots, data || TRACE_DATA_KEYS.has(key) || TRACE_PROSE_KEYS.has(key), depth + 1);
    if (projected !== item) changed = true;
    record[key] = projected;
  }
  return changed ? record : value;
}

function withholdTrustedDispatches(
  trace: AutomationStudioGraphExecutionTrace,
  dispatches: readonly TrustedDispatch[]
): AutomationStudioGraphExecutionTrace {
  let values = trace.values;
  let effects = trace.effects;
  const attempts = trace.attempts.map((attempt) => {
    const matching = dispatches.filter((dispatch) => dispatch.attemptId === attempt.attemptId);
    if (!matching.length) return attempt;
    let attemptOutputs = attempt.outputs;
    let attemptEffects = attempt.effects;
    let comparison = attempt.transitionComparison;
    for (const dispatch of matching) {
      for (const outputId of dispatch.persistence.outputIds ?? []) {
        if (!Object.hasOwn(dispatch.outputs, outputId)) continue;
        const value = dispatch.outputs[outputId]!;
        attemptOutputs = withheldEntry(attemptOutputs, outputId);
        if (comparison) {
          comparison = {
            ...comparison,
            actual: { ...comparison.actual, outputs: withheldEntry(comparison.actual.outputs, outputId) }
          };
        }
        values = withheldEntry(values, `${dispatch.nodeId}.${outputId}`);
        if (Object.is(values[outputId], value)) values = withheldEntry(values, outputId);
      }
      if ((dispatch.persistence.effectPayloadKeys?.length ?? 0) > 0) {
        attemptEffects = attemptEffects.map((effect, index) => index === dispatch.effectIndex
          ? withholdEffectPayloadKeys(effect, dispatch.persistence.effectPayloadKeys!)
          : effect);
        if (comparison) {
          comparison = {
            ...comparison,
            actual: {
              ...comparison.actual,
              effects: comparison.actual.effects.map((effect, index) => index === dispatch.effectIndex
                ? withholdEffectPayloadKeys(effect, dispatch.persistence.effectPayloadKeys!)
                : effect)
            }
          };
        }
        effects = effects.map((effect) => effect.nodeId === dispatch.nodeId && effect.type === dispatch.effect.type
          && effect.payload === dispatch.effect.payload
          ? { ...withholdEffectPayloadKeys(effect, dispatch.persistence.effectPayloadKeys!), nodeId: effect.nodeId }
          : effect);
      }
    }
    return {
      ...attempt,
      outputs: attemptOutputs,
      effects: attemptEffects,
      ...(comparison ? { transitionComparison: comparison } : {})
    };
  });
  return { ...trace, attempts, values, effects };
}

function withheldEntry(entries: Record<string, JsonValue>, key: string): Record<string, JsonValue> {
  if (!Object.hasOwn(entries, key)) return entries;
  return { ...entries, [key]: AUTOMATION_STUDIO_WITHHELD_VALUE };
}

function withholdEffectPayloadKeys<T extends { type: string; payload?: JsonValue }>(effect: T, keys: readonly string[]): T {
  if (!effect.payload || typeof effect.payload !== "object" || Array.isArray(effect.payload)) return effect;
  let payload = effect.payload as Record<string, JsonValue>;
  for (const key of keys) payload = withheldEntry(payload, key);
  return { ...effect, payload };
}

function recordSuppliedValue(authored: JsonValue | undefined, resolved: JsonValue, withheld: WithheldValues, depth: number): void {
  // Identity is the whole proof: resolution hands back a subtree it did not
  // change, so anything else is a value the document does not carry.
  if (authored === resolved) return;
  if (depth < MAXIMUM_WITHHOLDING_DEPTH) {
    if (isPlainRecord(authored) && isPlainRecord(resolved)) {
      for (const [key, value] of Object.entries(resolved)) recordSuppliedValue(authored[key], value, withheld, depth + 1);
      return;
    }
    // A length change means positions no longer line up, so the whole array is
    // treated as supplied rather than compared element by element.
    if (Array.isArray(authored) && Array.isArray(resolved) && authored.length === resolved.length) {
      for (const [index, value] of resolved.entries()) recordSuppliedValue(authored[index], value, withheld, depth + 1);
      return;
    }
  }
  recordWithheldScalars(resolved, withheld, depth);
}

/**
 * Every scalar inside a supplied subtree, because a node is free to lift one
 * field out of the object a binding resolved to and put only that in its effect.
 * Booleans and null are not collected: one bit carries no credential, and there
 * are four such values in JSON, so withholding them would blank the trace's own
 * flags everywhere without protecting anything.
 */
function recordWithheldScalars(value: JsonValue, withheld: WithheldValues, depth: number): void {
  if (typeof value === "string") {
    if (value) withheld.texts.add(value);
    return;
  }
  if (typeof value === "number") {
    if (Number.isFinite(value)) withheld.numbers.add(value);
    return;
  }
  if (!value || typeof value !== "object" || depth >= MAXIMUM_WITHHOLDING_DEPTH) return;
  for (const item of Array.isArray(value) ? value : Object.values(value)) recordWithheldScalars(item, withheld, depth + 1);
}

/** One `apply`'s rewrite: the shared text rule, built once for the recorded texts, and the recorded numbers. */
type TraceRewrite = { text: (text: string) => string; numbers: Set<number> };

function withheldTraceValue(value: unknown, rewrite: TraceRewrite, data: boolean, depth: number): unknown {
  if (typeof value === "string") return data ? rewrite.text(value) : value;
  if (typeof value === "number") return data && rewrite.numbers.has(value) ? AUTOMATION_STUDIO_WITHHELD_VALUE : value;
  if (!value || typeof value !== "object") return value;
  // A dataset marker stands in for rows the run captured, and holds only the
  // dataset id, a count or ordinal, and a digest. A count that equals a withheld
  // number is still a count. Only markers the record summary issued are passed:
  // an object a producer returned in the same shape is withheld like any data.
  if (isAutomationStudioRecordTraceMarker(value)) return value;
  if (depth >= MAXIMUM_WITHHOLDING_DEPTH) return AUTOMATION_STUDIO_WITHHELD_VALUE;
  if (Array.isArray(value)) {
    let changed = false;
    const items = value.map((item) => {
      const withheldItem = withheldTraceValue(item, rewrite, data, depth + 1);
      if (withheldItem !== item) changed = true;
      return withheldItem;
    });
    return changed ? items : value;
  }
  let changed = false;
  const record: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const withheldItem = withheldTraceValue(item, rewrite, data || TRACE_DATA_KEYS.has(key) || TRACE_PROSE_KEYS.has(key), depth + 1);
    if (withheldItem !== item) changed = true;
    record[key] = withheldItem;
  }
  // A subtree with nothing withheld is handed back as it arrived, so the rewrite
  // never allocates a copy of a trace it did not change.
  return changed ? record : value;
}

function isPlainRecord(value: JsonValue | undefined): value is Record<string, JsonValue> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
