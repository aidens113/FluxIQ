import { describe, expect, it } from "vitest";
import { createGlobalProgramRuntime } from "../../../../programs/_shared/runtime.ts";
import { adminRole, rolePolicyNames, viewerRole, type Role } from "../../../../programs/identity-access/index.ts";
import { IAM_OWNER_FULL_ACCESS, resolveIamPredefinedPolicy } from "../../predefined/index.ts";
import type { IamPolicy } from "../../types.ts";
import { compareIamRoleParity, type IamParityRole } from "../index.ts";

function mappedRole(role: Role): IamParityRole {
  const names = rolePolicyNames(role.id);
  if (names === null) throw new Error(`role ${role.id} has no policy mapping`);
  const policies = names.map((name): IamPolicy => {
    const policy = resolveIamPredefinedPolicy(name);
    if (policy === null) throw new Error(`role ${role.id} maps to ${name}, which is not a predefined policy`);
    return policy;
  });
  return { id: role.id, permissions: role.permissions, policies };
}

describe("IAM role parity over the live program registry", () => {
  const registrations = createGlobalProgramRuntime().api.endpoints();

  it("FluxIQAdministratorAccess and FluxIQReadOnlyAccess allow exactly what admin and viewer allow today", () => {
    const report = compareIamRoleParity({ registrations, roles: [mappedRole(adminRole), mappedRole(viewerRole)] });
    console.info(JSON.stringify({ registrations: report.registrations, roles: report.roles, profiles: report.profiles, compared: report.compared, decisions: report.decisions, allows: report.allows, denies: report.denies, byRole: report.byRole }));
    expect(report.registrations).toBe(registrations.length);
    expect(report.compared).toBe(registrations.length * 2);
    expect(report.mismatches, JSON.stringify(report.mismatches.slice(0, 20))).toEqual([]);
    expect(report.byRole.admin?.denies).toBe(0);
    expect(report.byRole.viewer?.allows).toBeGreaterThan(0);
    expect(report.byRole.viewer?.denies).toBeGreaterThan(0);
  });

  it("denies every action to a principal with no policies", () => {
    const report = compareIamRoleParity({ registrations, roles: [{ id: "none", permissions: [], policies: [] }] });
    console.info(JSON.stringify({ none: report.byRole.none }));
    expect(report.mismatches).toEqual([]);
    expect(report.byRole.none?.iamAllows).toBe(0);
    expect(report.byRole.none?.iamDenies).toBe(report.decisions);
  });

  it("FluxIQOwnerFullAccess allows every action, each on the full-access fast path", () => {
    const report = compareIamRoleParity({ registrations, roles: [{ id: "owner", permissions: adminRole.permissions, policies: [IAM_OWNER_FULL_ACCESS] }] });
    console.info(JSON.stringify({ owner: report.byRole.owner }));
    expect(report.mismatches, JSON.stringify(report.mismatches.slice(0, 20))).toEqual([]);
    expect(report.byRole.owner?.iamAllows).toBe(report.decisions);
    expect(report.byRole.owner?.fullAccess).toBe(report.decisions);
  });
});
