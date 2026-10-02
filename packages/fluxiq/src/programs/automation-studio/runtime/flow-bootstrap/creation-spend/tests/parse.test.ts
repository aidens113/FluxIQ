// A Flow creation's spend is read back only when it is whole and written for
// this Flow: a damaged record is refused, and the build carries nothing.
import { describe, expect, it } from "vitest";
import { parseAutomationStudioFlowBootstrapCreationSpend, type AutomationStudioFlowBootstrapCreationSpend } from "../index.ts";

const OWNER = { projectId: "p1", flowId: "f1" };
const RECORD: AutomationStudioFlowBootstrapCreationSpend = { kind: "flow_creation_spend", ...OWNER, spentUsd: 0.0731, builds: 2, createdAt: 1_000, updatedAt: 2_000 };

describe("a Flow creation's spend read back", () => {
  it("reads a whole record written for this Flow", () => {
    expect(parseAutomationStudioFlowBootstrapCreationSpend(structuredClone(RECORD), OWNER)).toEqual(RECORD);
  });

  it("drops fields it does not know", () => {
    expect(parseAutomationStudioFlowBootstrapCreationSpend({ ...RECORD, extra: true }, OWNER)).toEqual(RECORD);
  });

  it.each([
    ["another Flow's", { ...RECORD, flowId: "f2" }],
    ["another project's", { ...RECORD, projectId: "p2" }],
    ["another kind", { ...RECORD, kind: "flow_bootstrap_incomplete_draft" }],
    ["a negative spend", { ...RECORD, spentUsd: -0.01 }],
    ["a spend that is not a number", { ...RECORD, spentUsd: "0.05" }],
    ["an infinite spend", { ...RECORD, spentUsd: Number.POSITIVE_INFINITY }],
    ["no builds", { ...RECORD, builds: 0 }],
    ["a fractional build count", { ...RECORD, builds: 1.5 }],
    ["a missing time", { ...RECORD, updatedAt: undefined }],
    ["an array", [RECORD]],
    ["nothing", null]
  ])("refuses %s record", (_label, value) => {
    expect(parseAutomationStudioFlowBootstrapCreationSpend(value, OWNER)).toBeNull();
  });
});
