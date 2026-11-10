// What a read's own conditions left out rides its record batch, as its answer said it, and nothing else does
// (run-mwaudvnh-c208d32c: a saved Flow's run told the judge what each read kept and never what it left out).
// A greenhouse's seed list, no realistic scenario.
import { describe, expect, it } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { captureAutomationStudioRecordBatch } from "../../capture.ts";
import { automationStudioRecordReadLeftOut } from "../left-out.ts";

const PATH = ["result", "extracted"];
const PARAMETERS: JsonObject = { list: { item: ".seed", fields: { name: ".name", stock: ".stock" }, where: [{ field: "stock", atLeast: 1 }] }, rejectedSamples: "alone" };
const EXTRACTION: JsonObject = { recordCount: 1, pagesRead: 1, truncated: false, fieldNames: ["name", "stock"], missingFields: [], conditions: { applied: 2, kept: 1, rejected: [1], unfiltered: false }, rejectedSamples: [[{ name: "Sweet Pea", stock: "0" }]], rejectedSamplesAlone: [1] };
const recordOutput = { datasetId: "seeds", recordsPath: "result.extracted", writeMode: "append", schema: { schemaVersion: "0.1", fields: [{ id: "name", label: "Name", valueType: "string", required: true }] } };

describe("what a read left out, carried on its record batch", () => {
  it("takes the answer's own account beside the rows, and the parameters the read was dispatched with", () => {
    expect(automationStudioRecordReadLeftOut({ outputId: "read", parameters: PARAMETERS }, { result: { extracted: [], extraction: EXTRACTION } }, PATH)).toEqual({ extraction: EXTRACTION, parameters: PARAMETERS });
    // The gateway's wrapping puts the account one object out: it is found there too.
    expect(automationStudioRecordReadLeftOut({ parameters: PARAMETERS }, { extraction: EXTRACTION, result: { extracted: [] } }, PATH)).toEqual({ extraction: EXTRACTION, parameters: PARAMETERS });
  });

  it("carries nothing where the answer said nothing was left out, and no parameters where none were sent", () => {
    const { rejectedSamples: _gone, rejectedSamplesAlone: _alone, ...counts } = EXTRACTION;
    expect(automationStudioRecordReadLeftOut({ parameters: PARAMETERS }, { result: { extracted: [], extraction: counts } }, PATH)).toBeUndefined();
    expect(automationStudioRecordReadLeftOut({ parameters: PARAMETERS }, { result: { extracted: [] } }, PATH)).toBeUndefined();
    expect(automationStudioRecordReadLeftOut(undefined, { result: { extracted: [], extraction: EXTRACTION } }, PATH)).toEqual({ extraction: EXTRACTION });
  });

  it("rides the batch the capture makes, beside the rows it kept", () => {
    const answer: JsonValue = { result: { extracted: [{ name: "Marigold" }], extraction: EXTRACTION } };
    const captured = captureAutomationStudioRecordBatch({
      effect: { type: "policy.output.dispatch", payload: { outputId: "read", parameters: PARAMETERS, recordOutput } },
      dispatched: { status: "success", route: "success", outputs: { result: answer } },
      nodeId: "read", attemptId: "attempt.1"
    });
    expect(captured.batch?.rows).toEqual([{ name: "Marigold" }]);
    expect(captured.batch?.leftOut).toEqual({ extraction: EXTRACTION, parameters: PARAMETERS });
  });
});
