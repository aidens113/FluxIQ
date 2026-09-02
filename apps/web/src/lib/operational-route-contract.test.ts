import { describe, expect, it } from "vitest";
import { OPERATIONAL_FRAMEWORK_ROUTES, canUseOperationalRoute, operationalRouteContract } from "./operational-route-contract";

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

  it("fails closed for unclassified operations and enforces declared permissions", () => {
    expect(() => operationalRouteContract("POST", "/api/framework/setup", "erase")).toThrow(/Unclassified/);
    const migration = operationalRouteContract("POST", "/api/framework/setup", "migrate");
    expect(canUseOperationalRoute(["programs.read"], migration)).toBe(false);
    expect(canUseOperationalRoute(["programs.write"], migration)).toBe(true);
  });
});
