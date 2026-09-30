// Improving a Flow and settling the change it suggests, from the conversation.
//
// A built Flow's suggested change is `proposed`; approving makes it
// `validated`, and only applying puts it into the Flow. "Keep it" has to reach
// the Flow, so `adaptation.apply` sends both reviews. `flow.improve` saves the
// person's words before it builds, because the build reads nothing else.

import { describe, expect, it, vi } from "vitest";
import type { ProgramCommandTransport } from "../../../../data/program-transport";
import { dispatchPanelCapability } from "../../index";
import { suggestedChangeSentence } from "../adaptations";

function transport(adaptations: Array<{ adaptationId: string; status: string }>, detail: Record<string, unknown> = {}) {
  const calls: Array<{ endpoint: string; payload: Record<string, unknown> }> = [];
  const post = vi.fn(async (endpoint: string, payload: Record<string, unknown>) => {
    calls.push({ endpoint, payload });
    if (endpoint === "list-flow-adaptations") return { ok: true, payload: { adaptations, page: { adaptations } } };
    if (endpoint === "get-flow-adaptation") return { ok: true, payload: { adaptation: { adaptationId: payload.adaptationId, ...detail } } };
    if (endpoint === "save-flow-instruction") return { ok: true, payload: { instruction: { instructionId: "instruction.improvement.one", status: "active" } } };
    return { ok: true, payload: { adaptation: { adaptationId: payload.adaptationId ?? "adaptation.extend.one", status: "proposed" } } };
  });
  return { api: { get: vi.fn(), post } as unknown as ProgramCommandTransport, calls };
}
const scope = (api: ProgramCommandTransport) => ({ transport: api, projectId: "p1", flowId: "f1" });

describe("improving a Flow from the conversation", () => {
  const detail = { flowId: "f1", settings: { llm: { provider: "deepseek", model: "deepseek-flash", secretKeyId: "key.one" } } };
  function improving(overrides: Record<string, unknown> = {}) {
    const calls: Array<{ endpoint: string; payload: Record<string, unknown> }> = [];
    const post = vi.fn(async (endpoint: string, payload: Record<string, unknown>) => {
      calls.push({ endpoint, payload });
      if (endpoint in overrides) return overrides[endpoint];
      if (endpoint === "get-flow-metadata-detail") return { ok: true, payload: { flow: detail } };
      if (endpoint === "save-flow-instruction") return { ok: true, payload: { instruction: { instructionId: "instruction.improvement.one", status: "active" } } };
      return { ok: true, payload: { adaptation: { adaptationId: "adaptation.extend.one", status: "proposed" } } };
    });
    return { api: { get: vi.fn(), post } as unknown as ProgramCommandTransport, calls };
  }

  it("saves what should change, then asks Core for an evidence-guided extend, with no grant step", async () => {
    const { api, calls } = improving();
    const dispatch = await dispatchPanelCapability(scope(api), { capabilityId: "flow.improve", arguments: { change: "Close the What's new announcement when it is showing." } });
    expect(dispatch.outcome.status).toBe("done");
    expect(calls.map((call) => call.endpoint)).toEqual(["get-flow-metadata-detail", "save-flow-instruction", "generate-flow-bootstrap-adaptation"]);
    expect(calls[1]!.payload).toMatchObject({ projectId: "p1", flowId: "f1", body: "Close the What's new announcement when it is showing.", requirement: "required", tags: ["generation"] });
    expect(calls[2]!.payload).toEqual({ projectId: "p1", flowId: "f1", evidenceGuided: true, mode: "extend" });
  });

  it("changes nothing when the Flow has no model key", async () => {
    const { api, calls } = improving({ "get-flow-metadata-detail": { ok: true, payload: { flow: { flowId: "f1", settings: { llm: {} } } } } });
    const dispatch = await dispatchPanelCapability(scope(api), { capabilityId: "flow.improve", arguments: { change: "x" } });
    expect(dispatch.outcome).toMatchObject({ status: "failed", summary: expect.stringContaining("no DeepSeek model key") });
    expect(calls.map((call) => call.endpoint)).toEqual(["get-flow-metadata-detail"]);
  });

  it("builds nothing when the words could not be saved", async () => {
    const { api, calls } = improving({ "save-flow-instruction": { ok: false, error: "Instruction title and body are required." } });
    const dispatch = await dispatchPanelCapability(scope(api), { capabilityId: "flow.improve", arguments: { change: "x" } });
    expect(dispatch.outcome.status).toBe("failed");
    expect(calls.map((call) => call.endpoint)).toEqual(["get-flow-metadata-detail", "save-flow-instruction"]);
  });
});

describe("settling a suggested change from the conversation", () => {
  it("approves then applies the newest waiting change", async () => {
    const { api, calls } = transport([{ adaptationId: "a.applied", status: "applied" }, { adaptationId: "a.proposed", status: "proposed" }]);
    const dispatch = await dispatchPanelCapability(scope(api), { capabilityId: "adaptation.apply" });
    expect(dispatch.outcome.status).toBe("done");
    expect(calls.slice(1)).toEqual([
      { endpoint: "review-flow-adaptation", payload: { projectId: "p1", flowId: "f1", adaptationId: "a.proposed", action: "approve" } },
      { endpoint: "review-flow-adaptation", payload: { projectId: "p1", flowId: "f1", adaptationId: "a.proposed", action: "apply" } }
    ]);
  });

  it("applies a change already approved without approving it again", async () => {
    const { api, calls } = transport([{ adaptationId: "a.validated", status: "validated" }]);
    await dispatchPanelCapability(scope(api), { capabilityId: "adaptation.apply" });
    expect(calls.slice(1).map((call) => call.payload.action)).toEqual(["apply"]);
  });

  it("rejects a waiting change with a reason and never reverts an applied one", async () => {
    const { api, calls } = transport([{ adaptationId: "a.applied", status: "applied" }]);
    const nothing = await dispatchPanelCapability(scope(api), { capabilityId: "adaptation.reject" });
    expect(nothing.outcome).toMatchObject({ status: "failed", summary: expect.stringContaining("no suggested change waiting") });
    expect(calls.map((call) => call.endpoint)).toEqual(["list-flow-adaptations"]);

    const waiting = transport([{ adaptationId: "a.proposed", status: "proposed" }]);
    await dispatchPanelCapability(scope(waiting.api), { capabilityId: "adaptation.reject", arguments: { reason: "It clicked the wrong button." } });
    expect(waiting.calls[1]).toEqual({ endpoint: "review-flow-adaptation", payload: { projectId: "p1", flowId: "f1", adaptationId: "a.proposed", action: "reject", reason: "It clicked the wrong button." } });
  });

  it("says what the change does in words", async () => {
    const { api, calls } = transport([{ adaptationId: "a.proposed", status: "proposed" }], {
      status: "proposed",
      diagnosis: "Close the announcement when it shows",
      patch: [{ summary: "Create Router Week ahead with 1 rules." }, { summary: "Create Week ahead with 6 nodes and 5 edges." }]
    });
    const dispatch = await dispatchPanelCapability(scope(api), { capabilityId: "adaptation.show" });
    expect(calls.map((call) => call.endpoint)).toEqual(["list-flow-adaptations", "get-flow-adaptation"]);
    expect(dispatch.outcome).toMatchObject({ status: "done", summary: "Close the announcement when it shows. It changes: Create Router Week ahead with 1 rules. Create Week ahead with 6 nodes and 5 edges. It is waiting for you to accept or reject it." });
    expect(suggestedChangeSentence({ status: "applied", trigger: "Instruction-built Flow Bootstrap" })).toBe("Instruction-built Flow Bootstrap. It lists no individual changes. It is applied.");
  });
});
