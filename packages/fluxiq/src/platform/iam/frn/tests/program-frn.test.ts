// Operator program FRNs, in a workspace and at platform level.
import { describe, expect, it } from "vitest";
import { iamProgramFrn } from "../index.ts";

describe("iamProgramFrn", () => {
  it("formats a workspace program and a platform program", () => {
    expect(iamProgramFrn("ws1", "database-manager")).toBe("frn:fluxiq:ops:ws1:program/database-manager");
    expect(iamProgramFrn(null, "deployment-sync")).toBe("frn:fluxiq:ops::program/deployment-sync");
  });

  it("refuses an id the grammar refuses", () => {
    expect(() => iamProgramFrn("ws1", "")).toThrow(TypeError);
    expect(() => iamProgramFrn("ws 1", "docs")).toThrow(TypeError);
  });
});
