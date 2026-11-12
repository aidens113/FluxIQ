// Covers ../flow-humanness.ts.
import { describe, expect, it } from "vitest";
import { automationStudioFlowHumanness } from "../index.ts";

describe("a Flow's own humanness", () => {
  it.each([0, 50, 100])("reads %s", (value) => expect(automationStudioFlowHumanness({ humanness: value })).toBe(value));
  it.each([undefined, null, 101, -1, 2.5, "50"])("reads %s as none", (value) => expect(automationStudioFlowHumanness({ humanness: value })).toBeUndefined());
  it("reads a Flow without metadata as none", () => {
    expect(automationStudioFlowHumanness(undefined)).toBeUndefined();
    expect(automationStudioFlowHumanness({})).toBeUndefined();
  });
});
