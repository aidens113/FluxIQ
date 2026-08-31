import { describe, expect, it } from "vitest";
import {
  createMediumAutomationStudioProjectFixture,
  mediumProjectFixtureCounts,
} from "./medium-project-fixture";
import {
  createScaleAutomationStudioProjectFixture,
  scaleProjectFixtureCounts,
} from "./scale-project-fixture";

describe("Automation Studio deterministic certification fixtures", () => {
  it("provides a repeatable medium fixture with realistic bounded collections", () => {
    const first = createMediumAutomationStudioProjectFixture();
    const second = createMediumAutomationStudioProjectFixture();

    expect(first.counts).toEqual(mediumProjectFixtureCounts);
    expect(first.project).toMatchObject({ id: "project.medium", name: "Medium deterministic project" });
    expect(first.hierarchyNodes).toHaveLength(mediumProjectFixtureCounts.hierarchyNodes);
    expect(first.hierarchyNodes.every((node) => node.projectId === "project.medium")).toBe(true);
    expect(first.flows[64]).toEqual(second.flows[64]);
    expect(first.actions.at(-1)).toEqual(second.actions.at(-1));
  });

  it("names the existing thousands-scale profile explicitly and remains configurable", () => {
    const defaultFixture = createScaleAutomationStudioProjectFixture();
    const focusedFixture = createScaleAutomationStudioProjectFixture({ flows: 4, actions: 16 });

    expect(defaultFixture.counts).toEqual(scaleProjectFixtureCounts);
    expect(defaultFixture.project).toMatchObject({ id: "project.scale", name: "Scale deterministic project" });
    expect(defaultFixture.hierarchyNodes.every((node) => node.projectId === "project.scale")).toBe(true);
    expect(focusedFixture.flows).toHaveLength(4);
    expect(focusedFixture.actions).toHaveLength(16);
  });
});
