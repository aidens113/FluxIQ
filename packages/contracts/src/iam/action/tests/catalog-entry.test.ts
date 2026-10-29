// The action catalog entry format: what the generator writes for an endpoint
// and a route, and the entries it must never write.
import { describe, expect, it } from "vitest";
import { iamActionCatalogEntrySchema, iamActionCatalogSchema, type IamActionCatalogEntry } from "../index.ts";

const createProject: IamActionCatalogEntry = {
  action: "studio:CreateProject",
  accessLevel: "Write",
  resourceTypes: ["*"],
  sources: [{ kind: "endpoint", programId: "automation-studio", endpoint: "create-project" }],
  destructive: false,
  description: "Create a project in the workspace."
};

const readFlow: IamActionCatalogEntry = {
  action: "studio:GetFlow",
  accessLevel: "Read",
  resourceTypes: ["project/flow"],
  sources: [{ kind: "endpoint", programId: "automation-studio", endpoint: "get-flow" }],
  destructive: false,
  description: "Read one Flow."
};

const routeEntry: IamActionCatalogEntry = {
  action: "gateway:ListBrowsers",
  accessLevel: "List",
  resourceTypes: ["browser"],
  sources: [{ kind: "route", method: "GET", path: "/api/account/browsers" }],
  destructive: false,
  description: "List the account's connected clients."
};

describe("IAM action catalog entries", () => {
  it.each([createProject, readFlow, routeEntry])("accepts $action", (entry) => {
    expect(iamActionCatalogEntrySchema.parse(entry)).toEqual(entry);
  });

  it("refuses an endpoint action that is not the generated name", () => {
    expect(iamActionCatalogEntrySchema.safeParse({ ...createProject, action: "studio:NewProject" }).success).toBe(false);
  });

  it("refuses resource types outside the action's service", () => {
    expect(iamActionCatalogEntrySchema.safeParse({ ...readFlow, resourceTypes: ["key"] }).success).toBe(false);
    expect(iamActionCatalogEntrySchema.safeParse({ ...readFlow, resourceTypes: ["project/widget"] }).success).toBe(false);
    expect(iamActionCatalogEntrySchema.safeParse({ ...readFlow, resourceTypes: ["*", "project"] }).success).toBe(false);
  });

  it("refuses an unknown access level, field or source", () => {
    expect(iamActionCatalogEntrySchema.safeParse({ ...readFlow, accessLevel: "Tagging" }).success).toBe(false);
    expect(iamActionCatalogEntrySchema.safeParse({ ...readFlow, extra: true }).success).toBe(false);
    expect(iamActionCatalogEntrySchema.safeParse({ ...routeEntry, sources: [{ kind: "route", method: "TRACE", path: "/api/x" }] }).success).toBe(false);
    expect(iamActionCatalogEntrySchema.safeParse({ ...routeEntry, sources: [{ kind: "route", method: "GET", path: "api/x" }] }).success).toBe(false);
  });

  it("accepts several sources and refuses none or more than 16", () => {
    const [first] = createProject.sources;
    const withSources = (count: number) => ({ ...createProject, sources: Array.from({ length: count }, () => first) });
    expect(iamActionCatalogEntrySchema.safeParse(withSources(16)).success).toBe(true);
    expect(iamActionCatalogEntrySchema.safeParse(withSources(17)).success).toBe(false);
    expect(iamActionCatalogEntrySchema.safeParse(withSources(0)).success).toBe(false);
    const { sources: _omitted, ...withoutSources } = createProject;
    expect(iamActionCatalogEntrySchema.safeParse(withoutSources).success).toBe(false);
  });

  it("refuses a catalog that names an action twice", () => {
    expect(iamActionCatalogSchema.safeParse([createProject, readFlow, routeEntry]).success).toBe(true);
    expect(iamActionCatalogSchema.safeParse([createProject, createProject]).success).toBe(false);
  });
});
