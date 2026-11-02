import { describe, expect, it } from "vitest";
import { AutomationInMemoryStateStore, buildSignalRegistryFromSchemas, discoverSignalDefinitions, stateValue } from "../index.ts";
describe("state foundation", () => {
it("reads, writes, snapshots, restores, subscribes, and diffs state", () => {
    const store = new AutomationInMemoryStateStore({ timestamp: 1, namespaces: {} });
    const events: unknown[] = [];
    const unsubscribe = store.subscribe((event) => events.push(event));

    store.registerSchema({ namespace: "runtime", path: "step", type: "string", label: "Step" });
    const write = store.write("runtime", "step", stateValue("string", "start", 2));

    expect(store.read("runtime", "step")?.value).toBe("start");
    expect(write.deltas).toHaveLength(1);
    expect(store.schemas()).toContainEqual(expect.objectContaining({ namespace: "runtime", path: "step" }));

    const next = { timestamp: 3, namespaces: { runtime: { schemaId: "runtime", schemaVersion: "0.1", values: { step: stateValue("string", "done", 3) } } } };
    expect(store.diff(next).map((delta) => delta.change)).toEqual(["changed"]);
    store.restore(next);
    expect(store.snapshot().namespaces.runtime?.values.step?.value).toBe("done");
    unsubscribe();
    expect(events.length).toBeGreaterThanOrEqual(2);
  });
it("builds signal registries from schemas and observed state", () => {
    const registry = buildSignalRegistryFromSchemas([
      { namespace: "app", path: "visible", type: "boolean", volatility: "normal", label: "Visible" }
    ], { registryId: "registry.test" });

    expect(registry.definitions[0]).toMatchObject({ path: "app.visible", comparator: { kind: "exact" } });

    const discovered = discoverSignalDefinitions({
      timestamp: 1,
      namespaces: {
        runtime: { schemaId: "runtime", schemaVersion: "0.1", values: { count: stateValue("number", 2, 1) } }
      }
    });
    expect(discovered.definitions[0]).toMatchObject({ path: "runtime.count", comparator: { kind: "numeric" } });
  });
});
