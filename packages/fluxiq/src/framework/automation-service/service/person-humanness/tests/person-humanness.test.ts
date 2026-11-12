// The starting value a service's run starts from: the request's own, else the person's stored
// value read through the reader bound for that service, else none.
import { describe, expect, it, vi } from "vitest";
import { AutomationStudioPersonHumanness } from "../index.ts";

describe("AutomationStudioPersonHumanness.startingFor", () => {
  it("takes the request's value and does not read the person's", async () => {
    const owner = {};
    const read = vi.fn(async () => 70);
    AutomationStudioPersonHumanness.bind(owner, read);
    expect(await AutomationStudioPersonHumanness.startingFor(owner, 20, "person.one")).toBe(20);
    expect(await AutomationStudioPersonHumanness.startingFor(owner, 0, "person.one")).toBe(0);
    expect(read).not.toHaveBeenCalled();
  });

  it("falls back to the person's stored value, read for the run's caller", async () => {
    const owner = {};
    const read = vi.fn(async (userId: string) => (userId === "person.one" ? 70 : null));
    AutomationStudioPersonHumanness.bind(owner, read);
    expect(await AutomationStudioPersonHumanness.startingFor(owner, undefined, "person.one")).toBe(70);
    expect(await AutomationStudioPersonHumanness.startingFor(owner, undefined, "person.two")).toBeUndefined();
    expect(read.mock.calls).toEqual([["person.one"], ["person.two"]]);
  });

  it("takes a stored 0 as a level", async () => {
    const owner = {};
    AutomationStudioPersonHumanness.bind(owner, () => 0);
    expect(await AutomationStudioPersonHumanness.startingFor(owner, undefined, "person.one")).toBe(0);
  });

  it("is none with no person known or no reader bound for that service", async () => {
    const bound = {};
    const read = vi.fn(async () => 70);
    AutomationStudioPersonHumanness.bind(bound, read);
    expect(await AutomationStudioPersonHumanness.startingFor(bound, undefined, undefined)).toBeUndefined();
    expect(await AutomationStudioPersonHumanness.startingFor({}, undefined, "person.one")).toBeUndefined();
    expect(read).not.toHaveBeenCalled();
  });

  it("lets a later bind replace the reader", async () => {
    const owner = {};
    AutomationStudioPersonHumanness.bind(owner, () => 10);
    AutomationStudioPersonHumanness.bind(owner, () => 90);
    expect(await AutomationStudioPersonHumanness.startingFor(owner, undefined, "person.one")).toBe(90);
  });
});
