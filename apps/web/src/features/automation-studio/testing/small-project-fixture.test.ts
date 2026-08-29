import { describe, expect, it } from "vitest";
import { createSmallAutomationStudioProjectFixture, smallProjectFixtureCounts } from "./small-project-fixture";

describe("small Automation Studio project fixture", () => {
  it("provides stable bounded data between empty and scale profiles", () => {
    const fixture = createSmallAutomationStudioProjectFixture();
    expect(fixture.project).toMatchObject({ id: "project.small", name: "Small deterministic project" });
    expect(fixture.counts).toEqual(smallProjectFixtureCounts);
    expect(fixture.flows).toHaveLength(2);
    expect(fixture.runs).toHaveLength(36);
    expect(fixture.actions).toHaveLength(240);
    expect(fixture.hierarchyNodes.every((node) => node.projectId === "project.small")).toBe(true);
  });
});