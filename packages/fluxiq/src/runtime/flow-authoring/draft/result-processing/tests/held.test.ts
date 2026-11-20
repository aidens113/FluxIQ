import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_FLOW_DRAFT_RESULT_KEY, automationStudioFlowDraftResultProcessingFor, automationStudioFlowDraftWithResultProcessing } from "../held.ts";

describe("the draft's result processing (t970)", () => {
  it("holds a declaration by key, replaces it, and clears it, never changing what it was given", () => {
    const first = automationStudioFlowDraftWithResultProcessing(undefined, AUTOMATION_STUDIO_FLOW_DRAFT_RESULT_KEY, { limit: 5 });
    const second = automationStudioFlowDraftWithResultProcessing(first, "people", { sort: [{ field: "name", order: "asc" }] });
    expect(first).toEqual({ result: { limit: 5 } });
    expect(second).toEqual({ result: { limit: 5 }, people: { sort: [{ field: "name", order: "asc" }] } });
    expect(automationStudioFlowDraftWithResultProcessing(second, "result", null)).toEqual({ people: { sort: [{ field: "name", order: "asc" }] } });
    expect(first).toEqual({ result: { limit: 5 } });
  });

  it("applies a dataset's own declaration first, else the result's to every output that is not a working read", () => {
    const held = { result: { limit: 5 }, people: { limit: 2 } };
    expect(automationStudioFlowDraftResultProcessingFor(held, { datasetId: "people" })).toEqual({ limit: 2 });
    expect(automationStudioFlowDraftResultProcessingFor(held, { datasetId: "listings" })).toEqual({ limit: 5 });
    expect(automationStudioFlowDraftResultProcessingFor(held, { datasetId: "lookup", purpose: "intermediate" })).toBeUndefined();
    expect(automationStudioFlowDraftResultProcessingFor({ people: { limit: 2 } }, { datasetId: "listings" })).toBeUndefined();
    expect(automationStudioFlowDraftResultProcessingFor(undefined, { datasetId: "listings" })).toBeUndefined();
  });
});
