import { IAM_PREDEFINED_POLICIES } from "@fluxiq/contracts/iam";
import { describe, expect, it } from "vitest";
import { adminRole, defaultRoles, ROLE_POLICY_NAMES, rolePolicyNames, viewerRole } from "../roles.ts";

describe("roles", () => {
  it("keeps today's roles and their permissions unchanged", () => {
    expect(adminRole).toEqual({
      id: "admin",
      permissions: ["programs.read", "programs.write", "flows.write", "runtime.control", "compute.control", "identity.manage", "data.manage", "secrets.manage"]
    });
    expect(viewerRole).toEqual({ id: "viewer", permissions: ["programs.read"] });
    expect(defaultRoles).toEqual([adminRole, viewerRole]);
    expect(defaultRoles.map((role) => role.id)).not.toContain("user");
  });

  it("maps admin, viewer and user to the contract's predefined identity policies", () => {
    expect(rolePolicyNames("admin")).toEqual(["FluxIQAdministratorAccess"]);
    expect(rolePolicyNames("viewer")).toEqual(["FluxIQReadOnlyAccess"]);
    expect(rolePolicyNames("user")).toEqual(["FluxIQUserAccess"]);
    const identityPolicies = new Set(IAM_PREDEFINED_POLICIES.filter((policy) => policy.kind === "identity").map((policy) => policy.name));
    for (const names of Object.values(ROLE_POLICY_NAMES)) {
      for (const name of names) expect(identityPolicies.has(name), name).toBe(true);
    }
  });

  it("maps every default role, and nothing else", () => {
    for (const role of defaultRoles) expect(rolePolicyNames(role.id)).not.toBeNull();
    expect(rolePolicyNames("owner")).toBeNull();
    expect(rolePolicyNames("constructor")).toBeNull();
    expect(rolePolicyNames("toString")).toBeNull();
    expect(Object.isFrozen(ROLE_POLICY_NAMES)).toBe(true);
  });
});
