// The workspace FRN: the parent a top-level create or list acts on.
import { parseFluxIQResourceName } from "@fluxiq/contracts/iam";
import { describe, expect, it } from "vitest";
import { iamWorkspaceFrn } from "../index.ts";

describe("iamWorkspaceFrn", () => {
  it("formats a platform workspace FRN with an empty workspace segment", () => {
    expect(iamWorkspaceFrn("ws1")).toBe("frn:fluxiq:platform::workspace/ws1");
    expect(parseFluxIQResourceName(iamWorkspaceFrn("ws1"))).toEqual({ service: "platform", workspaceId: null, resourceType: "workspace", resourceId: "ws1" });
  });

  it("refuses an id the grammar refuses", () => {
    expect(() => iamWorkspaceFrn("")).toThrow(TypeError);
    expect(() => iamWorkspaceFrn("a/b")).toThrow(TypeError);
    expect(() => iamWorkspaceFrn("ws*")).toThrow(TypeError);
  });
});
