// The action-name grammar and the generator's endpoint-to-action rule.
import { describe, expect, it } from "vitest";
import { iamActionName, isIamActionName } from "../index.ts";

describe("IAM action names", () => {
  it("derives the PascalCase action from a kebab-case endpoint", () => {
    expect(iamActionName("studio", "create-project")).toBe("studio:CreateProject");
    expect(iamActionName("secrets", "snapshot")).toBe("secrets:Snapshot");
    expect(iamActionName("secrets", "use-key")).toBe("secrets:UseKey");
    expect(iamActionName("studio", "export-csv-v2")).toBe("studio:ExportCsvV2");
  });

  it.each(["createProject", "create_project", "Create-Project", "create--project", "", "-x"])("refuses endpoint %j", (endpoint) => {
    expect(() => iamActionName("studio", endpoint)).toThrow(TypeError);
  });

  it("accepts well-formed action names only", () => {
    expect(isIamActionName("studio:CreateProject")).toBe(true);
    expect(isIamActionName("platform:GetAccount")).toBe(true);
    for (const name of ["studio:*", "studio:createProject", "web:Click", "studio:", ":CreateProject", "studio:Create-Project", "*", 7]) {
      expect(isIamActionName(name)).toBe(false);
    }
  });
});
