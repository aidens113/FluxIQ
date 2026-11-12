import { describe, expect, it } from "vitest";
import type { PipelineRecord } from "../../types.ts";
import { pipelineMapInvocations } from "../invocations.ts";

describe("mapped occurrence identity", () => {
  it("serializes stable source references without row or secret values", () => {
    const record: PipelineRecord = {
      data: { note: "private fixture value", label: "mutable label" },
      lineage: [{ pointer: "", runId: "original-run", stepId: "source", source: { kind: "read", readId: "opaque-snapshot:opaque-occurrence" } }]
    };
    const [call] = pipelineMapInvocations("save", [record]);
    expect(call?.invocationId).toContain("opaque-snapshot:opaque-occurrence");
    expect(call?.invocationId).not.toContain("private fixture value");
    expect(call?.invocationId).not.toContain("mutable label");
    expect(call?.invocationId).not.toContain("original-run");
  });

  it("keeps equal-valued snapshot occurrences distinct when reordered", () => {
    const rows: PipelineRecord[] = ["occurrence-a", "occurrence-b"].map((occurrence) => ({
      data: { note: "equal value" },
      lineage: [{ pointer: "", runId: "original-run", stepId: "source", source: { kind: "read", readId: `snapshot:${occurrence}` } }]
    }));
    const before = pipelineMapInvocations("save", rows);
    const after = pipelineMapInvocations("save", [...rows].reverse());
    expect(before[0]?.invocationId).not.toBe(before[1]?.invocationId);
    expect(after.map((call) => call.invocationId)).toEqual(before.map((call) => call.invocationId).reverse());
  });
});
