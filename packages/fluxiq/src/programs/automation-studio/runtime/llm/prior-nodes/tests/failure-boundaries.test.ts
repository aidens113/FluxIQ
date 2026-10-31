import { describe, expect, it, vi } from "vitest";
import * as provenance from "../../rerun-provenance/index.ts";
import * as coordinator from "../../node-reruns/index.ts";
import * as transport from "../batch-member.ts";
import * as identities from "../identity.ts";
import { batchCall, complete, priorNodesFixture, readCall } from "./fixtures.ts";

function inspectBatches() {
  const run = coordinator.runAutomationStudioLlmPriorNodes;
  const batches: Array<Awaited<ReturnType<typeof run>>> = [];
  const observed = vi.spyOn(coordinator, "runAutomationStudioLlmPriorNodes").mockImplementation(async (input) => {
    const result = await run(input);
    batches.push(result);
    return result;
  });
  return { batches, restore: () => observed.mockRestore() };
}

describe("private batch failure boundaries in the actual loop", () => {
  it("redacts an unexpected execute rejection while keeping the exact error privately", async () => {
    const rejected = new Error("private-execute-rejection-sentinel");
    const create = provenance.createAutomationStudioLlmRerunProvenance;
    const origin = vi.spyOn(provenance, "createAutomationStudioLlmRerunProvenance").mockImplementation((input) => {
      const original = create(input);
      return { ...original, execute: async () => { throw rejected; } };
    });
    const makeMember = transport.automationStudioLlmEvidenceBatchMember;
    const outward: unknown[] = [];
    const boundary = vi.spyOn(transport, "automationStudioLlmEvidenceBatchMember").mockImplementation((...args) => {
      const member = makeMember(...args);
      const execute = member.executeTool;
      member.executeTool = async (request) => {
        try { return await execute(request); }
        catch (error) {
          outward.push(error);
          throw error;
        }
      };
      return member;
    });
    const inspected = inspectBatches();
    const f = priorNodesFixture();
    try {
      const { result, decide } = f.run([readCall("a"), batchCall(["a"]), complete]);
      const ended = await result;
      expect(ended).toMatchObject({ ok: true, accounting: { toolCalls: 2 } });
      expect(outward).toHaveLength(1);
      expect(outward[0]).toMatchObject({ message: "Prior member executor failed." });
      expect(outward[0]).not.toBe(rejected);
      const receipt = inspected.batches[0]?.executed[0];
      if (!receipt || receipt.kind !== "threw" || !(receipt.error instanceof Error)) throw new Error("Expected a private failed member receipt.");
      expect(receipt.error.cause).toBe(rejected);
      expect(f.actualItems).toEqual(["one"]);
      const shown = decide.mock.calls[2]?.[0];
      expect(shown?.evidence.find((entry) => entry.callId === "batch")?.value).toMatchObject({ status: "stopped", executed: 0, unproven: 1, skipped: 0 });
      expect(JSON.stringify({ ended, requests: decide.mock.calls })).not.toContain("private-execute-rejection-sentinel");
      expect(ended.steps).toHaveLength(1);
    } finally {
      inspected.restore();
      boundary.mockRestore();
      origin.mockRestore();
    }
  });

  it("ends on lost list-guard recording after retaining the actual receipt and quota", async () => {
    const makeIdentity = identities.automationStudioLlmPriorNodesIdentity;
    let listHashes = 0;
    const guard = vi.spyOn(identities, "automationStudioLlmPriorNodesIdentity").mockImplementation(() => {
      const identity = makeIdentity();
      const wrapped: ReturnType<typeof makeIdentity> = { ...identity, hash(value) {
        if (Array.isArray(value.calls)) {
          listHashes += 1;
          if (listHashes === 2) throw new Error("private-list-recording-sentinel");
        }
        return identity.hash(value);
      } };
      return wrapped;
    });
    const inspected = inspectBatches();
    const f = priorNodesFixture();
    try {
      const { result, decide } = f.run([readCall("a"), batchCall(["a"]), complete]);
      const ended = await result;
      expect(ended).toMatchObject({ ok: false, code: "llm_evidence_loop.tool_failed", accounting: { iterations: 2, toolCalls: 2 } });
      expect(listHashes).toBe(2);
      expect(decide).toHaveBeenCalledTimes(2);
      expect(f.actualItems).toEqual(["one", "one"]);
      expect(inspected.batches[0]?.listRecord).toBe("failed");
      expect(inspected.batches[0]?.executed[0]).toMatchObject({ kind: "returned", callId: "batch.member.1", result: { evidence: { ok: true, item: "one" } } });
      expect(ended.trace.some((row) => row.callId === "batch.member.1" && row.decision === "tool_call")).toBe(true);
      expect(ended.trace.some((row) => row.decision === "complete")).toBe(false);
      expect(ended.steps).toHaveLength(1);
      expect(JSON.stringify({ ended, requests: decide.mock.calls })).not.toContain("private-list-recording-sentinel");
    } finally {
      inspected.restore();
      guard.mockRestore();
    }
  });
});
