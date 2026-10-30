// A subflow submission's `then` (t811; Core's rule "build the whole Flow first;
// test it whole only when it should work"): what Core does with the revision a
// `core.submit_subflow` call makes, in the same call (`../subflow-candidate/builder-loop.ts`).
//
// - `"test_whole"`: once accepted, the part's test, as `core.test_subflow`
//   with that revision and digest runs it (`../subflow-candidate/subflow-trial-gate.ts`). While a
//   failed test's repair stands, the gate refuses it with
//   `subflow.trial_from_step_first` unless `fromStepImpossible` says why a run
//   from the failing step cannot check it (`../subflow-candidate/pending-repair.ts`).
// - `{"from": "<step>"}`: once accepted, a run of the part from that step,
//   never judged and never the part's test (`../subflow-candidate/from-step-run.ts`).
// - absent: save only, as before t811. A submit never tests unless asked.
//
// `fromStepImpossible` is honoured only beside `"test_whole"`; elsewhere it is
// set aside and the answer says so. A `then` Core cannot read refuses the call
// before anything is submitted, since what it asked for is unknown.
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_SUBFLOW_SUBMIT_THEN_WORDS as WORDS } from "./submit-then-words.ts";

/** The code a submission is refused under when its `then` is not one Core reads. */
const INVALID = "subflow.submit_then_invalid";
const MAX_FROM = 200;

/** What a submit call asked: the submission itself, less `then` and `fromStepImpossible`; the test fields its test adds to its revision and digest, where it asked one; and a note of what was set aside. */
export type AutomationStudioSubflowSubmitThenRead =
  | { ok: true; submission: JsonObject; test?: { from?: string; fromStepImpossible?: JsonValue } | undefined; note?: string | undefined }
  | { ok: false; code: string; instruction: string };

export const AUTOMATION_STUDIO_SUBFLOW_SUBMIT_THEN = Object.freeze({
  /** The submit input's added properties (header): `then` where a trial can run, `fromStepImpossible` where the port can also run from a step. */
  properties(trials: boolean, fromStep: boolean): JsonObject {
    if (!trials) return {};
    const whole: JsonObject = { type: "string", enum: ["test_whole"] };
    const from: JsonObject = { type: "object", properties: { from: { type: "string", minLength: 1, maxLength: MAX_FROM } }, required: ["from"], additionalProperties: false };
    return {
      then: fromStep ? { description: WORDS.then(true), anyOf: [whole, from] } : { ...whole, description: WORDS.then(false) },
      ...(fromStep ? { fromStepImpossible: { type: "string", minLength: 1, maxLength: 500, description: WORDS.impossible } } : {})
    };
  },

  /** The call `value` is (header); `fromStep`, whether the port can run from a step. */
  read(value: JsonObject, fromStep: boolean): AutomationStudioSubflowSubmitThenRead {
    const { then, fromStepImpossible, ...submission } = value;
    const setAside = fromStepImpossible !== undefined ? { note: WORDS.impossibleIgnored } : {};
    if (then === undefined) return { ok: true, submission, ...setAside };
    // The gate reads the reason as a whole test's, and refuses an empty one (`../subflow-candidate/test-input.ts`).
    if (then === "test_whole") return { ok: true, submission, test: fromStepImpossible !== undefined ? { fromStepImpossible } : {} };
    const from = isJsonObject(then) && Object.keys(then).length === 1 && typeof then.from === "string" && then.from.trim() && then.from.length <= MAX_FROM ? then.from : undefined;
    if (from === undefined) return { ok: false, code: INVALID, instruction: WORDS.invalid(fromStep) };
    return { ok: true, submission, test: { from }, ...setAside };
  }
});

function isJsonObject(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
