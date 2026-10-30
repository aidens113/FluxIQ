// The subflow test tool's input (`./subflow-trial-gate.ts`): its schema, and the
// gate's read of what a call sent. A call names the latest proposal's revision
// and digest and, only to narrow what Core defaults, `cannotUndo`. Where the
// gate's port can run from a step (t804, `./pending-repair.ts`), it may also
// name `from`, the step a run of the part starts at, which is never the part's
// test, or, on a whole test while a failed test's repair stands,
// `fromStepImpossible`: why a run from the failing step cannot check it.
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_SUBFLOW_REPAIR_WORDS as WORDS } from "./repair-words.ts";

/** A call the gate reads: its revision and digest, and the optional fields as sent. */
export type AutomationStudioSubflowTestCall = { revision: number; digest: string; cannotUndo?: JsonValue; from?: string; fromStepImpossible?: string };

const CANNOT_UNDO: JsonObject = { type: "array", maxItems: 50, items: { type: "string", pattern: "^act-[1-9][0-9]{0,3}$" }, description: "Optional; leave it out. Core defaults it to the acts a reset listed apart as ones no call can settle. Give it only to name, among the acts a reset listed, those the site offers no control to undo. They stay on the site, and the judge is told." };
const FROM: JsonObject = { type: "string", minLength: 1, maxLength: 200, description: "Optional: a step's key. Runs the part from that step on the page as it stands, with no judge; it is not the part's test." };
const IMPOSSIBLE: JsonObject = { type: "string", minLength: 1, maxLength: 500, description: "Optional, on a whole test only: why a run from the failing step cannot check its repair, in a sentence." };
const MAX_REASON = 500;

const INVALID = "subflow.trial_input_invalid";
const INVALID_SAID = "Call core.test_subflow with exactly the latest proposal's revision (an integer) and digest (a string), as core.submit_subflow returned them, and, only to narrow what Core defaults, cannotUndo: the act ids a reset listed that the site cannot undo.";
const INVALID_FROM_SAID = `${INVALID_SAID} To run from a step, add from: that step's key, and nothing else; fromStepImpossible goes only on a whole test.`;

export const AUTOMATION_STUDIO_SUBFLOW_TEST_INPUT = Object.freeze({
  /** The tool's input schema, with `from` and `fromStepImpossible` where the port can run from a step. */
  schema(fromStep: boolean): JsonObject {
    return { type: "object", properties: { revision: { type: "integer" }, digest: { type: "string" }, cannotUndo: structuredClone(CANNOT_UNDO), ...(fromStep ? { from: structuredClone(FROM), fromStepImpossible: structuredClone(IMPOSSIBLE) } : {}) },
      required: ["revision", "digest"], additionalProperties: false };
  },

  /** The call `value` is, or the refusal it gets; `fromStep`, whether the port can run from a step. */
  read(value: JsonObject, fromStep: boolean): { ok: true; call: AutomationStudioSubflowTestCall } | { ok: false; code: string; instruction: string } {
    const { revision, digest, cannotUndo, from, fromStepImpossible } = value;
    const known = new Set(["revision", "digest", "cannotUndo", ...(fromStep || from !== undefined || fromStepImpossible !== undefined ? ["from", "fromStepImpossible"] : [])]);
    const cannotUndoValid = cannotUndo === undefined || (Array.isArray(cannotUndo) && cannotUndo.length <= 50 && cannotUndo.every((act) => typeof act === "string"));
    if (!Number.isSafeInteger(revision) || typeof digest !== "string" || Object.keys(value).some((key) => !known.has(key)) || !cannotUndoValid) {
      return { ok: false, code: INVALID, instruction: fromStep ? INVALID_FROM_SAID : INVALID_SAID };
    }
    // A run from a step where the port cannot make one is said as such (t804).
    if (from !== undefined && !fromStep) return { ok: false, code: "subflow.from_step_unavailable", instruction: WORDS.unavailable };
    if (from !== undefined && (typeof from !== "string" || !from.trim() || from.length > 200 || cannotUndo !== undefined || fromStepImpossible !== undefined)) return { ok: false, code: INVALID, instruction: INVALID_FROM_SAID };
    if (fromStepImpossible !== undefined && (typeof fromStepImpossible !== "string" || !fromStepImpossible.trim())) return { ok: false, code: INVALID, instruction: WORDS.reasonEmpty };
    const call: AutomationStudioSubflowTestCall = { revision: revision as number, digest, ...(cannotUndo !== undefined ? { cannotUndo } : {}) };
    if (typeof from === "string") call.from = from;
    if (typeof fromStepImpossible === "string" && fromStep) call.fromStepImpossible = fromStepImpossible.trim().slice(0, MAX_REASON);
    return { ok: true, call };
  }
});
