import { describe, expect, it } from "vitest";
import { createEmptyAutomationStudioProjectFixture } from "./empty-project-fixture";

describe("empty Automation Studio project fixture", () => {
  it("contains one empty canonical Flow and no optional project data", () => {
    const fixture = createEmptyAutomationStudioProjectFixture();

    expect(fixture.flowEntry.flow.nodes).toEqual([]);
    expect(fixture.flowEntry.flow.edges).toEqual([]);
    expect(fixture.recordings).toEqual([]);
    expect(fixture.proposals).toEqual([]);
    expect(fixture.runtimeSessions).toEqual([]);
    expect(fixture.workspace.panes.length).toBeGreaterThan(0);
  });
});
