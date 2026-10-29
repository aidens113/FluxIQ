import { describe, expect, it } from "vitest";
import { IAM_READ_ONLY_ACCESS } from "../../predefined/index.ts";
import { compareIamRoleParity } from "../index.ts";

const registrations = [
  { programId: "automation-studio", endpoint: "get-flow", permission: "programs.read", classification: "read" },
  { programId: "automation-studio", endpoint: "create-project", permission: "flows.write", classification: "authoring" },
  { programId: "database-manager", endpoint: "snapshot", permission: "programs.read", classification: "read" }
];

describe("compareIamRoleParity", () => {
  it("counts pairs and decisions, and finds no mismatch where policy and permissions agree", () => {
    const report = compareIamRoleParity({ registrations, roles: [{ id: "viewer", permissions: ["programs.read"], policies: [IAM_READ_ONLY_ACCESS] }] });
    expect(report).toMatchObject({ registrations: 3, roles: 1, profiles: ["local", "self-hosted"], compared: 3, decisions: 6, allows: 2, denies: 1, mismatches: [] });
    expect(report.byRole.viewer).toEqual({ compared: 3, allows: 2, denies: 1, iamAllows: 4, iamDenies: 2, fullAccess: 0, mismatches: 0 });
  });

  it("reports each decision where IAM and today's check disagree, with the action and resource evaluated", () => {
    const report = compareIamRoleParity({ registrations, roles: [{ id: "writer", permissions: ["programs.read", "flows.write"], policies: [IAM_READ_ONLY_ACCESS] }], profiles: ["local"] });
    expect(report.mismatches).toEqual([
      {
        roleId: "writer",
        programId: "automation-studio",
        endpoint: "create-project",
        permission: "flows.write",
        action: "studio:CreateProject",
        resource: "frn:fluxiq:platform::workspace/parity-workspace",
        profile: "local",
        today: "allow",
        iam: "deny",
        matched: "implicit"
      }
    ]);
  });

  it("evaluates an operator program's action on the program's FRN", () => {
    const report = compareIamRoleParity({ registrations: [registrations[2]!], roles: [{ id: "none", permissions: ["programs.read"], policies: [] }], profiles: ["local"], workspaceId: "w9" });
    expect(report.mismatches[0]?.resource).toBe("frn:fluxiq:ops:w9:program/database-manager");
    expect(report.mismatches[0]?.action).toBe("ops:Snapshot");
  });
});
