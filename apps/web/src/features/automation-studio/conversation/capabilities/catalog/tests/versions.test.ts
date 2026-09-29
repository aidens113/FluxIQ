// Rolling a change back from the conversation. A person names the Flow, never
// a change id, so the capability finds the change itself and sends the review
// the Adaptations view's own buttons send: `action` and `flowId`, which Core's
// `review-flow-adaptation` requires.

import { describe, expect, it, vi } from "vitest";
import type { ProgramCommandTransport } from "../../../../data/program-transport";
import { dispatchPanelCapability } from "../../index";

function transport(adaptations: Array<{ adaptationId: string; status: string }>) {
  const calls: Array<{ endpoint: string; payload: Record<string, unknown> }> = [];
  const post = vi.fn(async (endpoint: string, payload: Record<string, unknown>) => {
    calls.push({ endpoint, payload });
    if (endpoint === "list-flow-adaptations") return { ok: true, payload: { adaptations, page: { adaptations } } };
    return { ok: true, payload: { adaptation: { adaptationId: payload.adaptationId } } };
  });
  return { api: { get: vi.fn(), post } as unknown as ProgramCommandTransport, calls };
}

describe("rolling a change back from the conversation", () => {
  it("reverts the Flow's newest change still in effect when it was applied", async () => {
    const { api, calls } = transport([
      { adaptationId: "a.rejected", status: "rejected" },
      { adaptationId: "a.applied", status: "applied" },
      { adaptationId: "a.older", status: "applied" }
    ]);
    const dispatch = await dispatchPanelCapability({ transport: api, projectId: "p1", flowId: "f1" }, { capabilityId: "version.rollBack" });

    expect(dispatch.outcome.status).toBe("done");
    expect(calls[0]).toEqual({ endpoint: "list-flow-adaptations", payload: { projectId: "p1", flowId: "f1", sort: "updated", direction: "desc", limit: 50, offset: 0 } });
    expect(calls[1]).toEqual({ endpoint: "review-flow-adaptation", payload: { projectId: "p1", flowId: "f1", adaptationId: "a.applied", action: "revert", reason: "Rolled back from the conversation." } });
  });

  it("rejects a change that never reached the Flow", async () => {
    const { api, calls } = transport([{ adaptationId: "a.proposed", status: "proposed" }]);
    await dispatchPanelCapability({ transport: api, projectId: "p1", flowId: "f1" }, { capabilityId: "version.rollBack" });
    expect(calls[1]?.payload).toMatchObject({ adaptationId: "a.proposed", action: "reject" });
  });

  it("says there is nothing to roll back, and sends no review, when no change is in effect", async () => {
    const { api, calls } = transport([{ adaptationId: "a.reverted", status: "reverted" }]);
    const dispatch = await dispatchPanelCapability({ transport: api, projectId: "p1", flowId: "f1" }, { capabilityId: "version.rollBack" });
    expect(dispatch.outcome).toMatchObject({ status: "failed", summary: expect.stringContaining("nothing to roll back") });
    expect(calls.map((call) => call.endpoint)).toEqual(["list-flow-adaptations"]);
  });

  it("accepts a change with the action and Flow Core's review requires", async () => {
    const { api, calls } = transport([]);
    await dispatchPanelCapability({ transport: api, projectId: "p1", flowId: "f1" }, { capabilityId: "version.accept", arguments: { adaptationId: "a.1" } });
    expect(calls).toEqual([{ endpoint: "review-flow-adaptation", payload: { projectId: "p1", flowId: "f1", adaptationId: "a.1", action: "approve" } }]);
  });
});
