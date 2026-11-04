// Reading a tool call for the act gate, from the shapes the calls really have.
//
// `core.run_node` (`S/runtime/llm/node-tools/run/node.ts`) carries `{ node,
// parameters, consequences }`; a model sometimes writes the declaration inside
// `parameters`, which the domain forgives (`node-run/nested-consequences.ts`), so
// this does too. A domain's own press tool carries `{ target, consequences }` at its
// top level. A replay (`S/runtime/llm/node-tools/replay/replay.ts`) carries the Flow's
// own call plus the reserved key:
//
//   replay: "step"    runs the step, a forward pass among them, with its row as `item`
//                     and its parameters resolved for that row: an act.
//   replay: "verify"  checks and runs nothing: an observation once it is answered.
//   replay: "reset"   puts the target back; the forward path never sends it. Not an act.
//
// `write: true` checks and freezes a step and does nothing, so it is no act either.

import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioAttemptActCall } from "../contracts.ts";

/**
 * The reserved keys of a replay call, as `S/runtime/llm/node-tools/replay/replay.ts` names
 * them. Restated, not imported: every run's options load this module, and a value import
 * of the loop's modules from here closes a cycle through the service that left a barrel
 * of the harness half filled (`runAutomationStudioLlmHarness is not a function`, in this
 * lane's own probe). `./tests/act-gate.test.ts` fails if the two part.
 */
const REPLAY_KEY = "replay";
const ITEM_KEY = "item";
const WRITE_KEY = "write";

/** What a call is, for the gate. */
export type AutomationStudioAttemptActCallRead =
  | { kind: "pass" }
  | { kind: "look" }
  | { kind: "act"; act: AutomationStudioAttemptActCall };

/** Keys of a domain's own tool that are about the call rather than what it sends. */
const NOT_SENT: ReadonlySet<string> = new Set(["node", "consequences", "instructedAct", REPLAY_KEY, ITEM_KEY, WRITE_KEY, "from", "produced"]);

/** What `call` is, for the gate (header). */
export function automationStudioAttemptActCallRead(call: { toolId: string; value: JsonObject }): AutomationStudioAttemptActCallRead {
  const { value } = call;
  const replay = value[REPLAY_KEY];
  if (replay === "reset" || value[WRITE_KEY] === true) return { kind: "pass" };
  if (replay === "verify") return { kind: "look" };
  const nested = record(value.parameters);
  const row = record(value[ITEM_KEY]);
  const instructed = typeof value.instructedAct === "string" ? value.instructedAct : undefined;
  return {
    kind: "act",
    act: {
      actionId: typeof value.node === "string" && value.node ? value.node : call.toolId,
      parameters: nested ?? Object.fromEntries(Object.entries(value).filter(([key]) => !NOT_SENT.has(key))),
      consequences: declared(value.consequences) ?? declared(nested?.consequences) ?? [],
      ...(instructed !== undefined ? { instructedAct: instructed } : {}),
      ...(row !== undefined ? { row } : {}),
      stage: replay === "step" ? "forward" : "exploration"
    }
  };
}

function declared(value: JsonValue | undefined): string[] | undefined {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : undefined;
}

function record(value: JsonValue | undefined): JsonObject | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : undefined;
}
