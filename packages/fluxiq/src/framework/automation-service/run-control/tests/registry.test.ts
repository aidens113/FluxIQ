import { describe, expect, it } from "vitest";
import { AutomationStudioRunControlRegistry, automationStudioRunControlOf } from "../index.ts";

describe("the live runs a host can pause", () => {
  it("answers a run that is not open with no control", () => {
    const registry = new AutomationStudioRunControlRegistry();
    expect(registry.pause("project.one", "run.none")).toBeNull();
    expect(registry.resume("project.one", "run.none")).toBeNull();
    expect(registry.snapshot("project.one", "run.none")).toBeNull();
    expect(registry.close("project.one", "run.none")).toBeNull();
  });

  it("hands back the same gate for a run opened twice, and forgets it once closed", async () => {
    const registry = new AutomationStudioRunControlRegistry({ now: () => 5 });
    const gate = registry.open("project.one", "run.one");
    expect(registry.open("project.one", "run.one")).toBe(gate);
    expect(registry.open("project.two", "run.one")).not.toBe(gate);

    expect(registry.pause("project.one", "run.one", { holder: "person" })).toMatchObject({ state: "pause_requested", holder: "person" });
    const held = gate.checkpoint({ nodeId: "a", step: 0 })!;
    const closed = registry.close("project.one", "run.one");
    expect(closed?.history.map((event) => event.kind)).toEqual(["pause_requested", "paused", "stopped_while_paused"]);
    expect(await held).toMatchObject({ outcome: "stop" });
    expect(registry.snapshot("project.one", "run.one")).toBeNull();
  });

  it("is found on a host that carries one, and on no other", () => {
    const runControl = new AutomationStudioRunControlRegistry();
    expect(automationStudioRunControlOf({ runControl })).toBe(runControl);
    expect(automationStudioRunControlOf({ runControl: {} })).toBeNull();
    expect(automationStudioRunControlOf({})).toBeNull();
    expect(automationStudioRunControlOf(null)).toBeNull();
  });
});
