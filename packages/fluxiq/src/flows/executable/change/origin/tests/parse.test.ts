import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import { parseExecutableChangeOrigin, type ExecutableChangeOrigin } from "../index.ts";

describe("change origin", () => {
const origins: ExecutableChangeOrigin[] = [
    { entryPoint: "instruction", instructionIds: ["instruction.1"] },
    { entryPoint: "run_failure", runId: "run.1", failedNodeId: "node.save", failureSignature: "0123456789abcdef01234567" },
    { entryPoint: "edge_case", instructionIds: ["instruction.1"] },
    { entryPoint: "edge_case", instructionIds: [], runId: "run.1", failureSignature: "sig.1" }
  ];

it("reads back every valid shape as an equal copy", () => {
    for (const origin of origins) {
      const parsed = parseExecutableChangeOrigin(origin);
      expect(parsed).toEqual(origin);
      expect(parsed).not.toBe(origin);
      if (parsed && "instructionIds" in parsed && "instructionIds" in origin) expect(parsed.instructionIds).not.toBe(origin.instructionIds);
    }
  });

it("fits in adaptation metadata and survives a JSON round trip", () => {
    for (const origin of origins) {
      const metadata: JsonObject = { origin };
      expect(parseExecutableChangeOrigin(JSON.parse(JSON.stringify(metadata)).origin)).toEqual(origin);
    }
  });

it("rejects anything that is not exactly one shape", () => {
    const invalid: unknown[] = [
      undefined,
      null,
      "instruction",
      [],
      {},
      { entryPoint: "recording", instructionIds: ["instruction.1"] },
      { entryPoint: "instruction", instructionIds: [] },
      { entryPoint: "instruction", instructionIds: ["instruction.1"], pageText: "Saved: Aurora Field Team" },
      { entryPoint: "instruction", instructionIds: ["instruction.1", "instruction.1"] },
      { entryPoint: "instruction", instructionIds: [" instruction.1"] },
      { entryPoint: "instruction", instructionIds: ["instruction\n1"] },
      { entryPoint: "instruction", instructionIds: Array.from({ length: 65 }, (_, index) => `instruction.${index}`) },
      { entryPoint: "run_failure", runId: "run.1", failedNodeId: "node.save" },
      { entryPoint: "run_failure", runId: "run.1", failedNodeId: "", failureSignature: "sig.1" },
      { entryPoint: "run_failure", runId: "run.1", failedNodeId: "node.save", failureSignature: "s".repeat(513) },
      { entryPoint: "run_failure", runId: "run.1", failedNodeId: "node.save", failureSignature: "sig.1", instructionIds: [] },
      { entryPoint: "edge_case", instructionIds: [] },
      { entryPoint: "edge_case", runId: "run.1" },
      { entryPoint: "edge_case", instructionIds: ["instruction.1"], failureSignature: "sig.1" },
      { entryPoint: "edge_case", instructionIds: ["instruction.1"], runId: 4 },
      { entryPoint: "edge_case", instructionIds: ["instruction.1"], failedNodeId: "node.save" }
    ];
    for (const value of invalid) expect(parseExecutableChangeOrigin(value), JSON.stringify(value)).toBeUndefined();
  });
});
