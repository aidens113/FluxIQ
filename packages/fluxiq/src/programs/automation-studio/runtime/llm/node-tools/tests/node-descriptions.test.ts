// One build's described-node memory: the ids an evidence decision is shown in
// full, in the order they were first described, each once (t235).

import { describe, expect, it, vi } from "vitest";
import { AutomationStudioNodeRegistry } from "../../../../nodes/index.ts";
import { automationStudioLlmNodeDescriptions } from "../node-descriptions.ts";

const resolution = { scope: { kind: "global" as const } };

describe("the described-node memory", () => {
  it("starts empty and keeps first-described order, each node once", () => {
    const memory = automationStudioLlmNodeDescriptions({ resolution });
    expect(memory.ids()).toEqual([]);
    expect(memory.describe(["builtin.logic.or", "builtin.logic.and", "builtin.logic.or"])).toEqual({ described: ["builtin.logic.or", "builtin.logic.and"], alreadyDescribed: [], unknown: [] });
    expect(memory.describe(["builtin.logic.and", "builtin.logic.not"])).toEqual({ described: ["builtin.logic.not"], alreadyDescribed: ["builtin.logic.and"], unknown: [] });
    expect(memory.ids()).toEqual(["builtin.logic.or", "builtin.logic.and", "builtin.logic.not"]);
  });

  it("names an id the catalog does not hold as unknown and never remembers it", () => {
    const memory = automationStudioLlmNodeDescriptions({ resolution });
    expect(memory.describe(["web.output.nowhere", "builtin.logic.and"])).toEqual({ described: ["builtin.logic.and"], alreadyDescribed: [], unknown: ["web.output.nowhere"] });
    expect(memory.ids()).toEqual(["builtin.logic.and"]);
    expect(memory.has("web.output.nowhere")).toBe(false);
    expect(memory.definition("web.output.nowhere")).toBeUndefined();
  });

  it("gives the catalog's own entry for a node, described or not", () => {
    const memory = automationStudioLlmNodeDescriptions({ resolution });
    const entry = memory.definition("builtin.logic.and");
    expect(entry?.id).toBe("builtin.logic.and");
    expect(entry?.parameters.map((parameter) => parameter.id)).toEqual(["emptyBehavior"]);
    expect(memory.has("builtin.logic.and")).toBe(false);
  });

  it("builds the catalog once, on first use, not when the memory is made", () => {
    const registry = new AutomationStudioNodeRegistry();
    const list = vi.spyOn(registry, "list");
    const memory = automationStudioLlmNodeDescriptions({ registry, resolution });
    expect(list).not.toHaveBeenCalled();
    memory.describe(["builtin.logic.and"]);
    memory.describe(["builtin.logic.or"]);
    memory.definition("builtin.logic.not");
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("is per build: a second memory starts empty", () => {
    const first = automationStudioLlmNodeDescriptions({ resolution });
    first.describe(["builtin.logic.and"]);
    expect(automationStudioLlmNodeDescriptions({ resolution }).ids()).toEqual([]);
  });
});
