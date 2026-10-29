import { describe, expect, it } from "vitest";
import { OPERATIONAL_FRAMEWORK_ROUTES, operationalRouteContract } from "../operational-route-contract";

describe("operational framework route disposition", () => {
  it("classifies every supported setup, migration, rollback, I/O, and validation operation", () => {
    expect(OPERATIONAL_FRAMEWORK_ROUTES.map((route) => route.id)).toEqual([
      "framework.inspect",
      "framework.setup",
      "framework.storage.migrate",
      "framework.storage.rollback",
      "framework.io.inspect",
      "framework.io.validate"
    ]);
    expect(OPERATIONAL_FRAMEWORK_ROUTES.every((route) => route.disposition === "api-only" && route.owner && route.recovery)).toBe(true);
  });

  it("fails closed for unclassified operations", () => {
    expect(() => operationalRouteContract("POST", "/api/framework/setup", "erase")).toThrow(/Unclassified/);
    expect(operationalRouteContract("POST", "/api/framework/setup").id).toBe("framework.setup");
  });

  it("decides each operation as an ops action on the framework's program, by the permission it always required", () => {
    expect(OPERATIONAL_FRAMEWORK_ROUTES.map((route) => [route.id, route.iam.action, route.iam.callers, route.iam.programId])).toEqual([
      ["framework.inspect", "ops:InspectFrameworkSetup", { panel: "programs.read" }, "framework"],
      ["framework.setup", "ops:SetupFramework", { panel: "programs.write" }, "framework"],
      ["framework.storage.migrate", "ops:MigrateFrameworkStorage", { panel: "programs.write" }, "framework"],
      ["framework.storage.rollback", "ops:RollbackFrameworkStorageMigration", { panel: "programs.write" }, "framework"],
      ["framework.io.inspect", "ops:InspectFrameworkIo", { panel: "programs.read" }, "framework"],
      ["framework.io.validate", "ops:ValidateFrameworkIo", { panel: "programs.read" }, "framework"]
    ]);
  });
});
