import type { AutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import type { JsonObject } from "../core/index.ts";
import {
  FLUXIQ_RUNTIME_WITHHELD_VALUE,
  type FluxIQRuntimeCommand,
  type FluxIQRuntimeCommandAttemptResult,
  type FluxIQRuntimeCommandResult,
  type FluxIQRuntimeWithheldValues
} from "./contracts.ts";
import { fluxiqRuntimeTextWithholding } from "./text-withholding.ts";

/**
 * How deep the walk descends before it withholds a subtree whole. The only
 * caller that withholds resolves bindings no deeper than 16 levels, so this is
 * headroom; a command or result that reached it would be pathological.
 */
const MAXIMUM_WITHHOLDING_DEPTH = 64;

export type WithheldLookup = { text: (text: string) => string; numbers: Set<number> };

/**
 * A caller's withheld values, ready to look up, or `null` when there is nothing
 * to withhold. Texts follow the one rule `fluxiqRuntimeTextWithholding` holds,
 * which Automation Studio's run traces share.
 */
export function withheldLookup(values: FluxIQRuntimeWithheldValues | undefined): WithheldLookup | null {
  const texts = (values?.texts ?? []).filter((text) => text.length > 0);
  const numbers = new Set((values?.numbers ?? []).filter((value) => Number.isFinite(value)));
  return texts.length || numbers.size ? { text: fluxiqRuntimeTextWithholding(texts), numbers } : null;
}

/**
 * The attempt's copy of a command. Every withheld value in its `parameters`,
 * `target` and `metadata` is replaced in place, keeping every key and every
 * other value; the command's own structure -- kind, ids, timeout -- is not a
 * value a caller supplied. With nothing to withhold, the command comes back as
 * given.
 */
export function withheldCommand(command: FluxIQRuntimeCommand & { commandId: string }, withheld: WithheldLookup | null): FluxIQRuntimeCommand & { commandId: string } {
  if (!withheld) return command;
  const kept = { ...command };
  if (command.parameters !== undefined) kept.parameters = withheldObject(command.parameters, withheld);
  if (command.target !== undefined) kept.target = withheldObject(command.target, withheld);
  if (command.metadata !== undefined) kept.metadata = withheldObject(command.metadata, withheld);
  return kept;
}

/**
 * The attempt's copy of a result. The payload is replaced whole when the caller
 * withheld it; otherwise every withheld value an adapter or client echoed is
 * replaced in place wherever the result carries data -- `message`, `error`,
 * `payload`, `target`, `metadata`, and the prose of a structured `failure`
 * (`expected`, `actual`). A failure's category, code, stage, retryability and
 * evidence digest are the producer's structure, not echoed data, and are kept
 * so the record still parses. A result with no payload gains none, and with
 * nothing to withhold the result comes back as given.
 */
export function withheldResult(result: FluxIQRuntimeCommandResult, withheld: WithheldLookup | null, withholdPayload: boolean): FluxIQRuntimeCommandAttemptResult {
  const payloadWithheld = withholdPayload && result.payload !== undefined;
  if (!withheld && !payloadWithheld) return result;
  const kept: FluxIQRuntimeCommandAttemptResult = { ...result };
  if (payloadWithheld) kept.payload = FLUXIQ_RUNTIME_WITHHELD_VALUE;
  if (!withheld) return kept;
  if (!payloadWithheld && result.payload !== undefined) kept.payload = withheldObject(result.payload, withheld);
  if (result.message !== undefined) kept.message = withheld.text(result.message);
  if (result.error !== undefined) kept.error = withheld.text(result.error);
  if (result.target !== undefined) kept.target = withheldObject(result.target, withheld);
  if (result.metadata !== undefined) kept.metadata = withheldObject(result.metadata, withheld);
  if (result.failure !== undefined) kept.failure = withheldFailure(result.failure, withheld);
  return kept;
}

function withheldFailure(failure: AutomationStudioFailureRecord, withheld: WithheldLookup): AutomationStudioFailureRecord {
  const kept = { ...failure };
  if (failure.expected !== undefined) kept.expected = withheld.text(failure.expected);
  if (failure.actual !== undefined) kept.actual = withheld.text(failure.actual);
  return kept;
}

function withheldObject(value: JsonObject, withheld: WithheldLookup): JsonObject {
  return withheldJson(value, withheld, 0) as JsonObject;
}

function withheldJson(value: unknown, withheld: WithheldLookup, depth: number): unknown {
  if (typeof value === "string") return withheld.text(value);
  if (typeof value === "number") return withheld.numbers.has(value) ? FLUXIQ_RUNTIME_WITHHELD_VALUE : value;
  if (!value || typeof value !== "object") return value;
  if (depth >= MAXIMUM_WITHHOLDING_DEPTH) return FLUXIQ_RUNTIME_WITHHELD_VALUE;
  if (Array.isArray(value)) return value.map((item) => withheldJson(item, withheld, depth + 1));
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, withheldJson(item, withheld, depth + 1)]));
}
