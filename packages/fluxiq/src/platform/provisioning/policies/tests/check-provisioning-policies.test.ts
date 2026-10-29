import { IAM_POLICY_LANGUAGE_VERSION } from "@fluxiq/contracts/iam";
import { describe, expect, it } from "vitest";
import { IAM_PREDEFINED_POLICY_DEFINITIONS, IAM_PROVISIONER } from "../../../iam/index.ts";
import type { IamPolicy } from "../../../iam/index.ts";
import { checkProvisioningPolicies } from "../check-provisioning-policies.ts";
import { policyGrantsPlatformAccess } from "../grants-platform-access.ts";
import { identityRoleForPolicies } from "../identity-role-for-policies.ts";

const SINGLE = { mode: "single", workspaceId: "ws" } as const;
const MULTI = { mode: "multi" } as const;

describe("policyGrantsPlatformAccess", () => {
  it("finds platform access only in the provisioner among the predefined policies", () => {
    const granting = IAM_PREDEFINED_POLICY_DEFINITIONS.filter((policy) => policyGrantsPlatformAccess(policy, 1)).map((policy) => policy.name);
    expect(granting).toEqual([IAM_PROVISIONER.name]);
  });

  it("catches a wildcard grant on platform resources", () => {
    const policy: IamPolicy = { name: "Wide", kind: "identity", document: { Version: IAM_POLICY_LANGUAGE_VERSION, Statement: [{ Effect: "Allow", Action: ["*"], Resource: ["*"] }] } };
    expect(policyGrantsPlatformAccess(policy, 1)).toBe(true);
  });
});

describe("checkProvisioningPolicies", () => {
  it("accepts the user-level policies, de-duplicated in order", () => {
    expect(checkProvisioningPolicies(["FluxIQUserAccess", "FluxIQReadOnlyAccess", "FluxIQUserAccess"], MULTI, "http", 1)).toEqual(["FluxIQUserAccess", "FluxIQReadOnlyAccess"]);
  });

  it("allows the owner policy only in single tenancy and in-process", () => {
    expect(checkProvisioningPolicies(["FluxIQOwnerFullAccess"], SINGLE, "in-process", 1)).toEqual(["FluxIQOwnerFullAccess"]);
    expect(() => checkProvisioningPolicies(["FluxIQOwnerFullAccess"], SINGLE, "http", 1)).toThrow(expect.objectContaining({ code: "forbidden_policy" }));
    expect(() => checkProvisioningPolicies(["FluxIQOwnerFullAccess"], MULTI, "in-process", 1)).toThrow(expect.objectContaining({ code: "forbidden_policy" }));
  });

  it("refuses non-provisionable and unknown names", () => {
    for (const name of ["FluxIQProvisioner", "FluxIQBrowserSession", "FluxIQServiceGuardrail", "Custom"]) {
      expect(() => checkProvisioningPolicies([name], SINGLE, "in-process", 1)).toThrow(expect.objectContaining({ code: "forbidden_policy" }));
    }
  });
});

describe("identityRoleForPolicies", () => {
  it("maps owner and administrator to admin and the rest to viewer", () => {
    expect(identityRoleForPolicies(["FluxIQUserAccess", "FluxIQAdministratorAccess"])).toBe("admin");
    expect(identityRoleForPolicies(["FluxIQOwnerFullAccess"])).toBe("admin");
    expect(identityRoleForPolicies(["FluxIQReadOnlyAccess", "FluxIQUserAccess"])).toBe("viewer");
  });
});
