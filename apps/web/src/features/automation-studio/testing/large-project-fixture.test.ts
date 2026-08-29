import { describe, expect, it } from "vitest";
import { createLargeAutomationStudioProjectFixture, defaultLargeProjectFixtureCounts } from "./large-project-fixture";

describe("large Automation Studio project fixture", () => {
  it("creates deterministic thousands-scale collections in linear-sized arrays", () => {
    const first = createLargeAutomationStudioProjectFixture();
    const second = createLargeAutomationStudioProjectFixture();

    for (const [key, count] of Object.entries(defaultLargeProjectFixtureCounts)) {
      expect(first[key as keyof typeof defaultLargeProjectFixtureCounts]).toHaveLength(count);
    }
    expect(first.generatedEntityCount).toBe(Object.values(defaultLargeProjectFixtureCounts).reduce((sum, count) => sum + count, 0));
    expect(first.flows[0]).toEqual(second.flows[0]);
    expect(first.actions.at(-1)).toEqual(second.actions.at(-1));
    expect(first.stateFacts.at(-1)).toEqual(second.stateFacts.at(-1));
  });

  it("supports cheap focused sizes and caps accidental runaway requests", () => {
    const fixture = createLargeAutomationStudioProjectFixture({ flows: 3, actions: 5, clients: Number.POSITIVE_INFINITY });
    expect(fixture.flows).toHaveLength(3);
    expect(fixture.actions).toHaveLength(5);
    expect(fixture.clients).toHaveLength(0);
    expect(createLargeAutomationStudioProjectFixture({ runs: 75_000 }).runs).toHaveLength(50_000);
  });
});
