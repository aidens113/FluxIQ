// Principal FRNs: workspace identities, and platform-level service identities.
import { describe, expect, it } from "vitest";
import { iamPrincipalFrn } from "../index.ts";

describe("iamPrincipalFrn", () => {
  it("formats workspace principals", () => {
    expect(iamPrincipalFrn("user", "ws1", "alice")).toBe("frn:fluxiq:iam:ws1:user/alice");
    expect(iamPrincipalFrn("role", "ws1", "Deployer")).toBe("frn:fluxiq:iam:ws1:role/Deployer");
    expect(iamPrincipalFrn("group", "ws1", "eng")).toBe("frn:fluxiq:iam:ws1:group/eng");
    expect(iamPrincipalFrn("service-identity", "ws1", "sync")).toBe("frn:fluxiq:iam:ws1:service-identity/sync");
  });

  it("formats a platform-level service identity with no workspace", () => {
    expect(iamPrincipalFrn("service-identity", null, "provisioner")).toBe("frn:fluxiq:iam::service-identity/provisioner");
  });

  it("refuses a user, group or role with no workspace, and a bad id", () => {
    expect(() => iamPrincipalFrn("user", null, "alice")).toThrow(TypeError);
    expect(() => iamPrincipalFrn("role", null, "Deployer")).toThrow(TypeError);
    expect(() => iamPrincipalFrn("user", "ws1", "a:b")).toThrow(TypeError);
  });
});
