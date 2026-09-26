import { describe, expect, it } from "vitest";
import {
  automationStudioFlowGraphVersion,
  automationStudioFlowInstructionDigest,
  automationStudioFlowVersionsFromMetadata,
  automationStudioMetadataWithFlowVersions,
  automationStudioRunFlowVersions
} from "../index.ts";

// The join between a verdict and a version, at the grain it is made: reading a
// version off the document the executor was handed, naming each graph once, and
// carrying the set on metadata so a reader of the run can say which version a
// result belongs to.
//
// The defect behind all of it is the build measured on 2026-09-25, where two
// `amend_draft` decisions deleted steps the exploration had itself proved and
// the run failed on its first action. There was no earlier version to return to
// -- and, worse, no way even to say which version had been judged.

describe("automationStudioFlowGraphVersion", () => {
  it("reads the revision the executor's own document carries", () => {
    const version = automationStudioFlowGraphVersion({ flow: { flowId: "flow.a", metadata: { graphRevision: 7 } } });
    expect(version).toEqual({ graphFlowId: "flow.a", revision: 7 });
  });

  it("names the Subflow a graph belongs to, where it is a Subflow's own graph", () => {
    const version = automationStudioFlowGraphVersion({ flow: { flowId: "flow.a.sub.graph", metadata: { graphRevision: 2 } }, subflowId: "sub.1" });
    expect(version).toEqual({ graphFlowId: "flow.a.sub.graph", revision: 2, subflowId: "sub.1" });
  });

  // Absent and zero are different facts. A Flow whose graph was never indexed
  // has no chain, and revision numbers start at 1, so a zero would be a number
  // claiming to be a version -- and a later rollback rule would read it as a
  // predecessor nobody ever confirmed.
  it("reads a Flow with no revision chain as absent, never as revision 0", () => {
    expect(automationStudioFlowGraphVersion({ flow: { flowId: "flow.legacy" } })).toEqual({ graphFlowId: "flow.legacy", revision: null });
    expect(automationStudioFlowGraphVersion({ flow: { flowId: "flow.legacy", metadata: {} } }).revision).toBeNull();
    expect(automationStudioFlowGraphVersion({ flow: { flowId: "flow.legacy", metadata: { graphRevision: 0 } } }).revision).toBeNull();
    expect(automationStudioFlowGraphVersion({ flow: { flowId: "flow.legacy", metadata: { graphRevision: "3" } } }).revision).toBeNull();
  });
});

describe("automationStudioRunFlowVersions", () => {
  it("names each graph once and drops what names no graph", () => {
    const set = automationStudioRunFlowVersions([
      { graphFlowId: "flow.parent", revision: 3 },
      undefined,
      { graphFlowId: "", revision: 9 },
      { graphFlowId: "flow.sub.graph", revision: 1, subflowId: "sub.1" }
    ]);
    expect(set).toEqual([{ graphFlowId: "flow.parent", revision: 3 }, { graphFlowId: "flow.sub.graph", revision: 1, subflowId: "sub.1" }]);
  });

  // What a repaired re-run needs: the repair moved one graph, so that entry is
  // restated and every other graph the run entered stays exactly as it was.
  it("keeps a repeated graph's first position and its last value", () => {
    const set = automationStudioRunFlowVersions([
      { graphFlowId: "flow.parent", revision: 3 },
      { graphFlowId: "flow.sub.graph", revision: 1, subflowId: "sub.1" },
      { graphFlowId: "flow.sub.graph", revision: 2, subflowId: "sub.1" }
    ]);
    expect(set.map((version) => version.graphFlowId)).toEqual(["flow.parent", "flow.sub.graph"]);
    expect(set[1]?.revision).toBe(2);
  });
});

describe("the version set on metadata", () => {
  it("round-trips through the metadata a run carries", () => {
    const versions = [{ graphFlowId: "flow.parent", revision: 3 }, { graphFlowId: "flow.sub.graph", revision: 1, subflowId: "sub.1" }];
    const metadata = automationStudioMetadataWithFlowVersions({ adaptiveRuntime: true }, versions);
    expect(metadata.adaptiveRuntime).toBe(true);
    expect(automationStudioFlowVersionsFromMetadata(metadata)).toEqual(versions);
  });

  // An empty set is not a statement that the run executed no graph: a run with
  // no canonical Flow at all computed nothing, and writing `[]` would claim it
  // had looked and found none.
  it("writes nothing for an empty set and leaves the rest of the metadata alone", () => {
    const metadata = automationStudioMetadataWithFlowVersions({ adaptiveRuntime: true }, []);
    expect(metadata).toEqual({ adaptiveRuntime: true });
    expect(automationStudioFlowVersionsFromMetadata(metadata)).toEqual([]);
  });

  it("reads a run recorded before any of this existed as the empty set", () => {
    expect(automationStudioFlowVersionsFromMetadata(undefined)).toEqual([]);
    expect(automationStudioFlowVersionsFromMetadata({ targetKind: "flow" })).toEqual([]);
    expect(automationStudioFlowVersionsFromMetadata({ flowVersions: "three" })).toEqual([]);
  });

  it("keeps an absent revision absent across the round trip, and drops an entry that names no graph", () => {
    const metadata = automationStudioMetadataWithFlowVersions(undefined, [{ graphFlowId: "flow.legacy", revision: null }]);
    expect(automationStudioFlowVersionsFromMetadata(metadata)).toEqual([{ graphFlowId: "flow.legacy", revision: null }]);
    expect(automationStudioFlowVersionsFromMetadata({ flowVersions: [{ revision: 2 }, { graphFlowId: "flow.a", revision: 0 }] }))
      .toEqual([{ graphFlowId: "flow.a", revision: null }]);
  });
});

describe("automationStudioFlowInstructionDigest", () => {
  // "Worse" is only meaningful against the same question, and the question is
  // the words. Re-ordering or re-prioritising instructions does not change what
  // was asked, so it must not sever a Flow from its own confirmed history --
  // which digesting the resolved instruction objects, ids and priorities
  // included, would do.
  it("is unmoved by the order the instructions were resolved in", () => {
    const one = { title: "Goal", body: "List the admins matching hollis." };
    const two = { title: "Constraint", body: "Do not open the export dialog." };
    expect(automationStudioFlowInstructionDigest([one, two])).toBe(automationStudioFlowInstructionDigest([two, one]));
  });

  it("moves when the words do", () => {
    const asked = automationStudioFlowInstructionDigest([{ title: "Goal", body: "List the admins." }]);
    expect(automationStudioFlowInstructionDigest([{ title: "Goal", body: "List the members." }])).not.toBe(asked);
    expect(automationStudioFlowInstructionDigest([{ title: "Goal", body: " List the admins. " }])).toBe(asked);
  });

  // A verdict Core settles from its own arithmetic reads no instruction. One
  // shared digest over the empty set would make every such run look like the
  // same question, which is the comparison that must never be made.
  it("is null where no question was read", () => {
    expect(automationStudioFlowInstructionDigest([])).toBeNull();
    expect(automationStudioFlowInstructionDigest([{ title: "  ", body: "" }])).toBeNull();
  });
});
