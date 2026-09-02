import { describe, expect, it } from "vitest";
import { createAutomationHierarchyUiCoordinator } from "./ui-coordinator";

describe("Automation hierarchy UI coordinator", () => {
  it("increments its revision only when hierarchy UI state changes", () => {
    const coordinator = createAutomationHierarchyUiCoordinator();
    expect(coordinator.getRevision()).toBe(0);

    expect(coordinator.setFilter({ search: "checkout", typeFilter: "all" })).toBe(true);
    expect(coordinator.getRevision()).toBe(1);
    expect(coordinator.setFilter({ search: "checkout", typeFilter: "all" })).toBe(false);
    expect(coordinator.getRevision()).toBe(1);
    expect(coordinator.reset()).toBe(true);
    expect(coordinator.getRevision()).toBe(2);
  });
});
