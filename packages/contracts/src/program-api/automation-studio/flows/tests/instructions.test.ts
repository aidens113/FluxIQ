// The instruction inputs: each accepts the request its handler reads, with a plain refusal otherwise.
import { describe, expect, it } from "vitest";
import { getFlowInstructionInput, getFlowInstructionReadinessInput, getFlowInstructionSetInput, listFlowInstructionsInput, saveFlowInstructionInput } from "../index.ts";

describe("Flow instruction inputs", () => {
  it("list accepts filters and refuses an unknown state", () => {
    expect(listFlowInstructionsInput.parse({ projectId: "p", status: "active", limit: 10, sort: "title" })).toEqual({ projectId: "p", status: "active", limit: 10, sort: "title" });
    expect(listFlowInstructionsInput.read({ projectId: "p", status: "gone" }).ok).toBe(false);
  });

  it("get, set and readiness name what they read", () => {
    expect(getFlowInstructionInput.parse({ projectId: "p", instructionId: "i" })).toEqual({ projectId: "p", instructionId: "i" });
    expect(getFlowInstructionSetInput.parse({ projectId: "p" })).toEqual({ projectId: "p" });
    expect(getFlowInstructionReadinessInput.read({ projectId: "p" }).ok).toBe(false);
  });

  it("save needs a title and a body", () => {
    expect(saveFlowInstructionInput.parse({ projectId: "p", flowId: "f", title: "Be polite", body: "Say please.", requirement: "required" }).requirement).toBe("required");
    expect(saveFlowInstructionInput.read({ projectId: "p", flowId: "f", title: "Be polite" })).toEqual({ ok: false, error: expect.stringContaining("body") });
  });
});
