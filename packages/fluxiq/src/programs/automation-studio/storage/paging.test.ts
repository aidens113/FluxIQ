import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_MAX_PAGE_LIMIT, automationStudioFilterHash, automationStudioPageLimit, decodeAutomationStudioPageCursor, encodeAutomationStudioPageCursor } from "./paging.ts";

describe("Automation Studio paging contracts", () => {
  it("caps limits and binds opaque versioned cursors to owner and filters", () => {
    expect(automationStudioPageLimit(10_000)).toBe(AUTOMATION_STUDIO_MAX_PAGE_LIMIT);
    const filterHash = automationStudioFilterHash({ search: "needle", status: "active" });
    const cursor = encodeAutomationStudioPageCursor({ owner: "router-routes:router.one", filterHash, values: { priority: 10, routeId: "route.one" } });
    expect(cursor).not.toContain("route.one");
    expect(decodeAutomationStudioPageCursor(cursor, { owner: "router-routes:router.one", filterHash })).toEqual({ priority: 10, routeId: "route.one" });
    expect(() => decodeAutomationStudioPageCursor(cursor, { owner: "router-routes:router.two", filterHash })).toThrow(/does not match/);
    expect(() => decodeAutomationStudioPageCursor(cursor, { owner: "router-routes:router.one", filterHash: automationStudioFilterHash({ search: "other" }) })).toThrow(/does not match/);
    expect(() => decodeAutomationStudioPageCursor("not-a-cursor", { owner: "router-routes:router.one", filterHash })).toThrow(/Invalid paging cursor/);
    const wrongShape = encodeAutomationStudioPageCursor({ owner: "router-routes:router.one", filterHash, values: { priority: "ten", routeId: 10 } });
    expect(() => decodeAutomationStudioPageCursor(wrongShape, { owner: "router-routes:router.one", filterHash, validate: (values) => Number.isSafeInteger(values.priority) && typeof values.routeId === "string" })).toThrow(/Invalid paging cursor/);
  });
});
