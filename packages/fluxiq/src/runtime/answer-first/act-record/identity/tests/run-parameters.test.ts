// t1075 A: a parameter Core writes onto a step for how it runs is never the act's identity
// (`flow-authoring/bootstrap/run-parameters/`). `run-mwynbry2-f3c88dc7` pressed a landed "+ Add" a second time
// because the assembly wrote `requiresChosen` onto its saved node and the act record counted it as identity.

import { describe, expect, it } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_REQUIRES_CHOSEN_PARAMETER, AUTOMATION_STUDIO_STEP_RUN_PARAMETERS } from "../../../../flow-authoring/bootstrap/index.ts";
import { automationStudioAttemptActTargetKeys } from "../index.ts";
import { RUN_MWYNBRY2_ACTION, RUN_MWYNBRY2_KEYS, RUN_MWYNBRY2_RAN_WITH, RUN_MWYNBRY2_SAVED_S11 } from "../../tests/run-mwynbry2-add.ts";

const keysOf = (parameters: JsonObject) => {
  const target = automationStudioAttemptActTargetKeys(RUN_MWYNBRY2_ACTION, parameters);
  return { keys: target.keys, placeKeys: target.placeKeys, wholeKeys: target.wholeKeys, handleKeys: target.handleKeys };
};

/** A value of the kind each run parameter holds: an object, a list, a number, words. */
const SAMPLES: readonly JsonValue[] = [{ gains: ["on"], via: "name" }, [{ words: "Option", at: { selector: "#option" } }], 2500, "words"];

describe("Core's run parameters and a step's identity", () => {
  it.each(Object.values(AUTOMATION_STUDIO_STEP_RUN_PARAMETERS))("%s leaves a node's identity keys as they are", (name) => {
    for (const value of SAMPLES) {
      expect(keysOf({ ...RUN_MWYNBRY2_RAN_WITH, [name]: value })).toEqual(keysOf(RUN_MWYNBRY2_RAN_WITH));
    }
  });

  it("holds the parameters the assembly writes, by the same names", () => {
    const names: readonly string[] = Object.values(AUTOMATION_STUDIO_STEP_RUN_PARAMETERS);
    expect(names).toContain(AUTOMATION_STUDIO_REQUIRES_CHOSEN_PARAMETER);
    for (const written of ["requiresChosen", "ensureState", "expectedState", "routeSignatures", "timeoutMs"]) expect(names).toContain(written);
  });

  it("keys run-mwynbry2's saved \"+ Add\" (requiresChosen and all) as the press attempt 1 landed", () => {
    const saved = automationStudioAttemptActTargetKeys(RUN_MWYNBRY2_ACTION, RUN_MWYNBRY2_SAVED_S11);
    const landed = automationStudioAttemptActTargetKeys(RUN_MWYNBRY2_ACTION, RUN_MWYNBRY2_RAN_WITH);
    // The act holds both: the fingerprint's key, and the place key of its address (which counts places) with the fingerprint.
    expect([...landed.keys, ...landed.placeKeys]).toEqual([...RUN_MWYNBRY2_KEYS.exploration]);
    // Before t1075 the saved node keyed as `3836...`, attempt 2's second press, and shared no key with the landed act.
    expect([...saved.keys, ...saved.placeKeys]).toEqual([...RUN_MWYNBRY2_KEYS.exploration]);
    expect(saved.keys).not.toContain(RUN_MWYNBRY2_KEYS.run[0]);
  });

  it("still tells two controls apart: a value the step sends is identity", () => {
    expect(keysOf({ ...RUN_MWYNBRY2_RAN_WITH, value: "2" })).not.toEqual(keysOf(RUN_MWYNBRY2_RAN_WITH));
  });
});
