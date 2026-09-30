// How many rows an attempt captured, read off a live trace and off a saved one.
//
// A run's saved trace holds a `$dataset` marker where the captured rows were
// (`executor/record-summary.ts`), and a later run is judged as a replay from
// exactly that trace. Counting only a live array read every saved extraction as
// "captured nothing", so no replay of an extraction Flow could prove its change
// and `established` was unreachable for the Flows the MVP builds (t176).

import { describe, expect, it } from "vitest";
import { automationStudioAttemptCapturedRecords } from "../attempt-projection.ts";

const SAVES = [{ type: "policy.output.dispatch", payload: { outputId: "read", recordOutput: { datasetId: "products" } } }];

describe("the rows an attempt captured", () => {
  it("counts a live array", () => {
    expect(automationStudioAttemptCapturedRecords({ effects: SAVES, outputs: { records: [{ name: "Alpha" }, { name: "Gamma" }] } })).toEqual({ captured: 2 });
  });

  it("counts the marker a saved trace holds in the rows' place", () => {
    expect(automationStudioAttemptCapturedRecords({ effects: SAVES, outputs: { records: { $dataset: { datasetId: "products", recordCount: 2, schemaDigest: "sha256:x" } } } })).toEqual({ captured: 2 });
  });

  it("reads a malformed marker, or none, as nothing captured, and a step that saves nothing as no answer", () => {
    for (const records of [{ $dataset: { datasetId: "products", recordCount: -1 } }, { $dataset: { recordCount: "2" } }, "withheld", undefined]) {
      expect(automationStudioAttemptCapturedRecords({ effects: SAVES, outputs: { records } as never })).toEqual({ captured: 0 });
    }
    expect(automationStudioAttemptCapturedRecords({ effects: [], outputs: { records: [{ name: "Alpha" }] } })).toBeUndefined();
  });
});
