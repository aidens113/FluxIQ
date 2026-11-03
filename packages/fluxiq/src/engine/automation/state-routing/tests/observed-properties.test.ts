import { describe, expect, it } from "vitest";
import type { ExecutableGraph } from "../../../../flows/executable/graph/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../index.ts";
import { enteredObservationFixture } from "../../../../runtime/execution-observation/tests/frame.ts";
import { automationStudioRepeatedLastingAct, automationStudioStateReopenOpener } from "../index.ts";

const opener = { id: "open", definitionId: "example.open", metadata: { routeSignatures: { after: { state: "open" } } } };
const node = { id: "step", definitionId: "example.step", metadata: { routeSignatures: { before: { state: "open" } } } };
const flow: ExecutableGraph = { flowId: "test", nodes: [opener, node], edges: [{ id: "next", sourceNodeId: opener.id, sourcePortId: "success", targetNodeId: node.id }] };
const ran: AutomationStudioNodeAttemptTrace = { attemptId: "open.1", nodeId: opener.id, definitionId: opener.definitionId, startedAt: 1, status: "succeeded", inputs: {}, outputs: {}, effects: [] };
const failed: AutomationStudioNodeAttemptTrace = { ...ran, attemptId: "step.1", nodeId: node.id, status: "failed", failure: { category: "target_not_found", code: "web.target.not_shown", retryable: true, stage: "target_resolution" }, outputs: { result: { result: { status: "failed", resolution: { strategy: "fingerprint", candidateCount: 1, bestScore: 0.8, shown: false } } } } };

describe.each(["reopen", "repeated"] as const)("%s resolver property", kind => {
  it.each(["own", "inherited"] as const)("fences a caught %s resolver getter on its actual input", async placement => {
    const f = await enteredObservationFixture();
    let reads = 0;
    await f.run(async observation => {
      const owner = {};
      Object.defineProperty(owner, "resolveActionEffect", { get() {
        reads++;
        return () => undefined;
      } });
      const prototype = placement === "inherited" ? owner : undefined;
      if (kind === "reopen") {
        const input: Parameters<typeof automationStudioStateReopenOpener>[0] = { flow, node, attempt: failed, attempts: [ran], hostRuntime: undefined };
        if (prototype) Object.setPrototypeOf(input, prototype);
        else Object.defineProperty(input, "resolveActionEffect", Object.getOwnPropertyDescriptor(owner, "resolveActionEffect")!);
        expect(() => automationStudioStateReopenOpener(input, observation)).toThrow("callback_accessor_unsupported");
      } else {
        const input: Parameters<typeof automationStudioRepeatedLastingAct>[0] = { flow, fromNodeId: node.id, toNodeId: opener.id, attempts: [ran], hostRuntime: undefined, observed: {} };
        if (prototype) Object.setPrototypeOf(input, prototype);
        else Object.defineProperty(input, "resolveActionEffect", Object.getOwnPropertyDescriptor(owner, "resolveActionEffect")!);
        expect(() => automationStudioRepeatedLastingAct(input, observation)).toThrow("callback_accessor_unsupported");
      }
    });
    expect(reads).toBe(0);
    await f.pending();
  });
});
