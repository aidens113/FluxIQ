// Runs a FluxNode's check in this process and turns its verdict into the answer the
// engine waits for (plan, N4). A check that fails, returns nothing useful, or throws
// is a "no" with its reason, which goes back into the run; it never ends the run.

import type { JsonObject, JsonValue } from "@fluxiq/contracts/core";
import type { FluxNodeEventAnswer } from "@fluxiq/contracts/fluxnode";
import type { AnyFluxNode } from "../define/index.ts";
import { isZodSchema } from "../schema/index.ts";

const MAX_REASON = 1000;

function fail(eventId: string, reason: string): FluxNodeEventAnswer {
  return { type: "check_answer", eventId, pass: false, reason: reason.slice(0, MAX_REASON) };
}

function typed(schema: unknown, value: JsonValue): { ok: true; value: unknown } | { ok: false; reason: string } {
  if (!isZodSchema(schema)) return { ok: true, value };
  const parsed = schema.safeParse(value);
  if (parsed.success) return { ok: true, value: parsed.data };
  return { ok: false, reason: `The values do not fit the declared type: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}` };
}

/** The answer to a `check_needed` event for `node`. */
export async function runCheck(node: AnyFluxNode | undefined, event: { eventId: string; outputs: JsonValue; inputs: JsonObject }): Promise<FluxNodeEventAnswer> {
  if (node?.check === undefined) return fail(event.eventId, "This program registered no check for this FluxNode, so the check cannot be answered.");
  const outputs = typed(node.outputsSchema, event.outputs);
  if (!outputs.ok) return fail(event.eventId, outputs.reason);
  const inputs = typed(node.inputsSchema, event.inputs);
  if (!inputs.ok) return fail(event.eventId, inputs.reason);
  let verdict: unknown;
  try {
    verdict = await (node.check as (arguments_: { outputs: unknown; inputs: unknown }) => unknown)({ outputs: outputs.value, inputs: inputs.value });
  } catch (error) {
    return fail(event.eventId, `The check threw: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (verdict === true) return { type: "check_answer", eventId: event.eventId, pass: true };
  if (typeof verdict === "string" && verdict !== "") return fail(event.eventId, verdict);
  if (verdict === false) return fail(event.eventId, "The check returned false.");
  return fail(event.eventId, "The check returned neither true nor a reason; return true to pass, or a string saying what is wrong.");
}
