import { describe, expect, it } from "vitest";
import { runAutomationStudioGraph } from "../../index.ts";
import { automationNodeStateBinding } from "../../../../components/automation/index.ts";
import type { AutomationStudioFlowDocument } from "../../tests/fixture-contracts.ts";
import { AutomationStudioGraphInputUseSession, type AutomationStudioInputUseRead, type AutomationStudioInputUseLease } from "../index.ts";

function gate<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

const flow: AutomationStudioFlowDocument = { schemaVersion: "0.1", flowId: "flow.late-input-authority", ownerKind: "task", ownerId: "task.synthetic", name: "Late authority", createdAt: 1, updatedAt: 1,
  nodes: [{ id: "echo", definitionId: "builtin.data.constant", parameterValues: { value: automationNodeStateBinding("query") } }], edges: [] };

describe("input-use cleanup after a settled graph cancellation", () => {
  it.each(["throwing status", "throwing close"] as const)("contains %s on a late authority result", async mode => {
    const entered = gate<void>(), opened = gate<AutomationStudioInputUseRead<AutomationStudioInputUseLease>>();
    const controller = new AbortController(), reason = { synthetic: "cancel-before-late-result" };
    const unhandled: unknown[] = [];
    const observeUnhandled = (error: unknown) => { unhandled.push(error); };
    let closes = 0;
    const session = new AutomationStudioGraphInputUseSession({ open: async () => {
      entered.resolve();
      return await opened.promise;
    }, child: async () => ({ status: "unknown", code: "producer_unverified" }) });
    process.on("unhandledRejection", observeUnhandled);
    try {
      const running = runAutomationStudioGraph(flow, { inputs: { query: "synthetic" }, signal: controller.signal, inputUse: session.port });
      await entered.promise;
      controller.abort(reason);
      const saved = await running;
      expect(saved.status).toBe("failed");
      expect(session.read(saved)).toEqual({ status: "unknown", code: "cancelled" });
      const late = mode === "throwing status" ? Object.defineProperty({}, "status", { get() {
        throw new Error("synthetic-late-status-failed");
      } }) as AutomationStudioInputUseRead<AutomationStudioInputUseLease> : { status: "bound" as const, value: {
        reference: { ownerId: "synthetic-owner", bindingId: "synthetic-binding", revision: 1 }, executionCopy: () => ({ query: "synthetic" }),
        verifyCurrent: async () => ({ status: "bound" as const, value: true as const }), close: () => {
          closes += 1;
          throw new Error("synthetic-late-close-failed");
        }
      } };
      opened.resolve(late);
      await new Promise<void>(done => setImmediate(done));
      expect(unhandled).toEqual([]);
      expect(controller.signal.reason).toBe(reason);
      expect(session.read(saved)).toEqual({ status: "unknown", code: "cancelled" });
      expect(closes).toBe(mode === "throwing close" ? 1 : 0);
    } finally {
      process.removeListener("unhandledRejection", observeUnhandled);
      session.close();
    }
  });
});
