import { describe, expect, it } from "vitest";
import { IamCatalogSourceLimitError, generateIamActionCatalog, iamActionsWithPermission, iamDestructiveActions, iamProgramService, renderIamActionCatalogModule } from "../index.ts";

const reg = (programId: string, endpoint: string, classification = "read", permission = "programs.read") => ({ programId, endpoint, permission, classification });

describe("generateIamActionCatalog", () => {
  it("maps programs to services, applies overrides and flags destructive", () => {
    const { catalog, undeclaredResources } = generateIamActionCatalog([
      reg("identity-access", "create-user", "authoring", "identity.manage"),
      reg("automation-studio", "list-projects"),
      reg("secret-keys", "delete-key", "program-gated", "secrets.manage"),
      reg("runtime", "status")
    ]);
    const byAction = Object.fromEntries(catalog.map((entry) => [entry.action, entry]));
    expect(byAction["iam:CreateUser"]?.accessLevel).toBe("PermissionsManagement");
    expect(byAction["studio:ListProjects"]?.accessLevel).toBe("List");
    expect(byAction["secrets:DeleteKey"]?.destructive).toBe(true);
    expect(byAction["ops:Status"]?.resourceTypes).toEqual(["program"]);
    expect(undeclaredResources).toEqual(["iam:CreateUser", "secrets:DeleteKey", "studio:ListProjects"]);
    expect(catalog.map((entry) => entry.action)).toEqual([...catalog.map((entry) => entry.action)].sort());
  });

  it("merges agreeing endpoints into one entry listing every source", () => {
    const result = generateIamActionCatalog([reg("runtime", "snapshot"), reg("docs", "snapshot")]);
    expect(result.catalog).toHaveLength(1);
    expect(result.catalog[0]?.sources).toEqual([
      { kind: "endpoint", programId: "docs", endpoint: "snapshot" },
      { kind: "endpoint", programId: "runtime", endpoint: "snapshot" }
    ]);
    expect(result.sharedActions).toEqual([{ action: "ops:Snapshot", sources: ["docs", "runtime"] }]);
  });

  it("refuses an action declared by more than 16 registrations with a typed error", () => {
    const many = Array.from({ length: 17 }, () => reg("runtime", "snapshot"));
    expect(() => generateIamActionCatalog(many)).toThrow(IamCatalogSourceLimitError);
  });

  it("throws when a shared action disagrees", () => {
    expect(() => generateIamActionCatalog([reg("runtime", "snapshot"), reg("docs", "snapshot", "destructive")])).toThrow(/disagree/u);
  });

  it("throws for an unknown program and for an unmapped classification", () => {
    expect(() => iamProgramService("mystery")).toThrow(/no IAM service/u);
    expect(() => generateIamActionCatalog([reg("runtime", "x", "weird")])).toThrow(/no default access level/u);
  });

  it("lists actions by permission and destructive classification", () => {
    const endpoints = [reg("runtime", "b"), reg("runtime", "a"), reg("runtime", "c", "destructive-ungated", "runtime.control")];
    expect(iamActionsWithPermission(endpoints, "programs.read")).toEqual(["ops:A", "ops:B"]);
    expect(iamDestructiveActions(endpoints)).toEqual(["ops:C"]);
    expect(renderIamActionCatalogModule(generateIamActionCatalog(endpoints).catalog)).toContain("IAM_ACTION_CATALOG");
  });
});
