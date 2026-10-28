// The predefined policy names provisioning may attach, and the service and
// request-origin vocabularies.
import { describe, expect, it } from "vitest";
import { IAM_POLICY_NAME_PATTERN, IAM_PREDEFINED_POLICIES, isFluxIQRequestOrigin, isIamService, isProvisionablePolicyName } from "../index.ts";

describe("predefined IAM policies", () => {
  it("names every policy of the plan's table once, in the policy-name grammar", () => {
    const names = IAM_PREDEFINED_POLICIES.map((policy) => policy.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toHaveLength(7);
    for (const name of names) expect(IAM_POLICY_NAME_PATTERN.test(name)).toBe(true);
  });

  it("lets provisioning attach only the user-level policies", () => {
    for (const name of ["FluxIQOwnerFullAccess", "FluxIQAdministratorAccess", "FluxIQReadOnlyAccess", "FluxIQUserAccess"]) expect(isProvisionablePolicyName(name)).toBe(true);
    for (const name of ["FluxIQBrowserSession", "FluxIQProvisioner", "FluxIQServiceGuardrail", "CustomPolicy"]) expect(isProvisionablePolicyName(name)).toBe(false);
  });

  it("types the guardrail and the session policy by kind", () => {
    expect(IAM_PREDEFINED_POLICIES.find((policy) => policy.name === "FluxIQServiceGuardrail")?.kind).toBe("guardrail");
    expect(IAM_PREDEFINED_POLICIES.find((policy) => policy.name === "FluxIQBrowserSession")?.kind).toBe("session");
  });

  it("knows the services and request origins", () => {
    expect(isIamService("studio")).toBe(true);
    expect(isIamService("web")).toBe(false);
    expect(isFluxIQRequestOrigin("extension-chat")).toBe(true);
    expect(isFluxIQRequestOrigin("browser")).toBe(false);
  });
});
