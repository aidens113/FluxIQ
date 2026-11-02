import { describe, expect, it } from "vitest";
import { createBlankAutomationStudioFlowArtifact } from "../../../../model/index.ts";
import { runCanonicalAutomationStudioFlow, type AutomationStudioHostRuntimeBoundary } from "../../../index.ts";
import { AutomationStudioHostLeaseScope, AutomationStudioHostResourceScheduler } from "../index.ts";
import { StubHost } from "../../../../../../runtime/host-resources/tests/stub-host.ts";
import { pairedClient, wire } from "../../../../../../runtime/host-resources/tests/gateway-fixtures.ts";

describe("a Studio Flow using the canonical host lease scope", () => {
  it("a trial run inside a scope stamps every command it dispatches", async () => {
    const { gateway, actions, act } = await pairedClient();
    const host = new StubHost({ capacity: 1 });
    const hostRuntime: AutomationStudioHostRuntimeBoundary = { capabilities: ["action-dispatch"], hostResources: host };
    const scope = new AutomationStudioHostLeaseScope(new AutomationStudioHostResourceScheduler(hostRuntime.hostResources!));
    const edge = (source: string, target: string) => ({ id: `${source}.${target}`, sourceNodeId: source, sourcePortId: "success", targetNodeId: target, targetPortId: "in" });
    const flow = {
      ...createBlankAutomationStudioFlowArtifact({ flowId: "flow.lease", projectId: "project", name: "Lease", now: 1 }),
      nodes: [
        { id: "start", definitionId: "builtin.control.start" },
        { id: "first", definitionId: "builtin.policy.action", parameterValues: { outputId: "output.first" } },
        { id: "second", definitionId: "builtin.policy.action", parameterValues: { outputId: "output.second" } },
        { id: "end", definitionId: "builtin.control.end" }
      ],
      edges: [edge("start", "first"), edge("first", "second"), edge("second", "end")]
    };
    const { lease, trace } = await scope.run({ role: "builder", briefId: "brief.trial" }, async (held) => ({
      lease: held,
      trace: await runCanonicalAutomationStudioFlow(flow, [], {
        hostRuntime,
        effectDispatcher: async () => {
          const result = await act("trial.act");
          return result.status === "succeeded" ? { status: "success", route: "success", outputs: {} } : { status: "failed", route: "failed", outputs: {} };
        }
      })
    }));
    expect(trace.status).toBe("succeeded");
    expect(actions.length).toBeGreaterThanOrEqual(2);
    for (const payload of actions) expect(payload.lease).toEqual(wire(lease));
    expect(host.inUse()).toBe(0);
    await gateway.close();
  });
});
