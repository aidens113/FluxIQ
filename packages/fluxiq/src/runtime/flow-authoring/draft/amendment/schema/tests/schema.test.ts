import { expect, it } from "vitest";
import type { DraftAmendmentDescriptions } from "../../../presentation/index.ts";
import { AUTOMATION_STUDIO_FLOW_DRAFT_AMENDMENT_SCHEMA, automationStudioFlowDraftAmendmentSchema } from "../index.ts";

it("keeps validation independent of explicit domain presentation", () => {
  const descriptions: DraftAmendmentDescriptions = {
    step: "Step number.", change: "Requested change.", settings: "Execution settings.",
    to: "Destination position.", input: "Configuration patch.", check: "Dependency check.",
    through: "Last repeated step.", over: "Repeated result source.", while: "Repeated check.",
    most: "Maximum passes.", act: "Requested act identifier.", place: "Route identifier."
  };
  const schema = automationStudioFlowDraftAmendmentSchema(descriptions);
  expect(schema).toMatchObject({
    type: "object", additionalProperties: false, required: ["step", "change"],
    properties: {
      step: { type: "integer", minimum: 1, description: "Step number." },
      change: { enum: ["add", "drop", "exploratory", "keep", "reorder", "rerun", "optional", "only_if", "on_failed", "repeat", "unrepeat", "bind"], description: "Requested change." },
      most: { type: "integer", minimum: 1, maximum: 10000, description: "Maximum passes." },
      while: { type: "integer", minimum: 1, description: "Repeated check." }
    }
  });
  expect(JSON.stringify(AUTOMATION_STUDIO_FLOW_DRAFT_AMENDMENT_SCHEMA)).not.toContain("description");
  expect(Object.keys(AUTOMATION_STUDIO_FLOW_DRAFT_AMENDMENT_SCHEMA.properties)).toEqual(Object.keys(descriptions));
});
