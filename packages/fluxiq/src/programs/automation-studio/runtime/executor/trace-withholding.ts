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
  return {
    record(authored, resolved) {
      recordSuppliedValue(authored, resolved, withheld, 0);
    },
    include(values) {
      for (const text of values.texts) if (text) withheld.texts.add(text);
      for (const value of values.numbers) if (Number.isFinite(value)) withheld.numbers.add(value);
    },
    apply<TTrace>(trace: TTrace): TTrace {
      if (!withheld.texts.size && !withheld.numbers.size) return trace;
      // The walk preserves every key and every value it does not withhold, and a
      // withheld leaf becomes a string, so the result has the shape of what it
      // was given. That is what the cast asserts and what the tests hold it to.
      return withheldTraceValue(trace, { text: fluxiqRuntimeTextWithholding(withheld.texts), numbers: withheld.numbers }, false, 0) as TTrace;
    },
    values() {
      return { texts: [...withheld.texts], numbers: [...withheld.numbers] };
    }
  };
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
