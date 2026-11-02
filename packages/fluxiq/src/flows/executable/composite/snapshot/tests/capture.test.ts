import { describe, expect, it } from "vitest";
import { createCallFlowNode } from "../../call/index.ts";
import { captureExecutableFlowSnapshot } from "../index.ts";
import { snapshotSource } from "./fixture.ts";

describe("executable snapshot capture", () => {
  it("keeps the pre-move digest for absent and explicitly undefined optional fields", () => {
    const source = snapshotSource();
    const snapshot = captureExecutableFlowSnapshot(source, "1.0.0");
    const explicit = captureExecutableFlowSnapshot({ ...source, regions: undefined, regionHandoffs: undefined, executionDefaults: undefined }, "1.0.0");
    expect(snapshot.flowDigest).toBe("sha256:57067e2954c0af91ce23e6537bd8b7001a1f848de13737e96a5cfcac93f7acbf");
    expect(explicit).toEqual(snapshot);
    for (const key of ["regions", "regionHandoffs", "executionDefaults", "schemaVersion", "name", "publishedAt", "projectId"]) {
      expect(Object.hasOwn(snapshot, key)).toBe(false);
    }
  });

  it("keeps empty optional collections present and distinct in the historical digest", () => {
    const snapshot = captureExecutableFlowSnapshot({ ...snapshotSource(), regions: [], regionHandoffs: [], executionDefaults: {} }, "1.0.0");
    expect(snapshot.flowDigest).toBe("sha256:1ec232715821cdcf966abeaa41204ce08b79f53e84d9c37f50194c5b9858b526");
    expect(snapshot.regions).toEqual([]);
    expect(snapshot.regionHandoffs).toEqual([]);
    expect(snapshot.executionDefaults).toEqual({});
  });

  it("clones the executable contract and graph apart from the mutable source", () => {
    const source = snapshotSource();
    const snapshot = captureExecutableFlowSnapshot(source, "1.0.0");
    source.interface.inputs[0]!.name = "Changed";
    source.nodes.push({ id: "later", definitionId: "builtin.control.end" });
    source.errors.push({ id: "later" });
    expect(snapshot.interface.inputs[0]?.name).toBe("Item");
    expect(snapshot.nodes).toEqual([]);
    expect(snapshot.errors).toEqual([]);
    expect(snapshot.scope).not.toBe(source.scope);
  });

  it("keeps dependency insertion order and sorted capability union in the pre-move digest", () => {
    const call = (id: string) => createCallFlowNode({ id, target: { flowId: id, version: "1.0.0", scope: { kind: "global" } } });
    const source = {
      ...snapshotSource(),
      nodes: [call("child.z"), call("child.a"), call("child.z")],
      regions: [{ id: "region", name: "Region", kind: "deterministic" as const, nodeIds: [], entryPorts: [], exitPorts: [], requiredRuntimeCapabilities: ["z", "a"] }]
    };
    const snapshot = captureExecutableFlowSnapshot(source, "1.0.0", {
      dependencyDigests: new Map([["child.z@1.0.0", "sha256:z"], ["child.a@1.0.0", "sha256:a"]]),
      requiredRuntimeCapabilities: ["a", "b"]
    });
    expect(snapshot.flowDigest).toBe("sha256:02df5197dfc50973f968266b194f42f19f4613614a503c0a10ae91bdb6039ff4");
    expect(snapshot.dependencies).toEqual([
      { flowId: "child.z", version: "1.0.0", flowDigest: "sha256:z" },
      { flowId: "child.a", version: "1.0.0", flowDigest: "sha256:a" }
    ]);
    expect(snapshot.requiredRuntimeCapabilities).toEqual(["a", "b", "z"]);
  });
});
