// What a build request must carry: the caller it is made for, and nothing that
// authorizes the model calls themselves.
import { describe, expect, it } from "vitest";
import { readAutomationStudioFlowBootstrapGenerationRequest } from "../generation-request.ts";

const CALLER = { actorUserId: "user.1", actorSessionId: "session.1" };

function input(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { projectId: "project-1", flowId: "flow-1", mode: "extend", evidenceGuided: true, caller: CALLER, ...extra };
}

describe("a Flow Bootstrap generation request", () => {
  it("reads the caller and the consequences the person allowed", () => {
    expect(readAutomationStudioFlowBootstrapGenerationRequest(input({ permittedConsequences: ["send_or_publish"] }))).toMatchObject({
      mode: "extend",
      caller: CALLER,
      permittedConsequences: ["send_or_publish"]
    });
  });

  it("permits no consequence when none is named", () => {
    expect(readAutomationStudioFlowBootstrapGenerationRequest(input({ mode: "create" }))).toMatchObject({ mode: "create", permittedConsequences: [] });
  });

  it("refuses a request with no caller", () => {
    expect(() => readAutomationStudioFlowBootstrapGenerationRequest(input({ caller: undefined }))).toThrow(/caller/);
  });

  it("refuses the fields a grant used to carry", () => {
    expect(() => readAutomationStudioFlowBootstrapGenerationRequest(input({ executionGrant: {} }))).toThrow(/unsupported fields: executionGrant/);
    expect(() => readAutomationStudioFlowBootstrapGenerationRequest(input({ caller: { ...CALLER, purpose: "build_and_adapt" } }))).toThrow(/unsupported fields: purpose/);
  });

  it("reads what the chat's reading of the message cost, and refuses anything but a finite, non-negative amount", () => {
    expect(readAutomationStudioFlowBootstrapGenerationRequest(input({ interpretationCostUsd: 0.0003 }))).toMatchObject({ interpretationCostUsd: 0.0003 });
    expect(readAutomationStudioFlowBootstrapGenerationRequest(input({ interpretationCostUsd: 0 }))).toMatchObject({ interpretationCostUsd: 0 });
    expect(readAutomationStudioFlowBootstrapGenerationRequest(input())).not.toHaveProperty("interpretationCostUsd");
    for (const bad of [-0.0001, Number.NaN, Number.POSITIVE_INFINITY, "0.0003", null]) {
      expect(() => readAutomationStudioFlowBootstrapGenerationRequest(input({ interpretationCostUsd: bad }))).toThrow(/interpretation cost/);
    }
  });
});
