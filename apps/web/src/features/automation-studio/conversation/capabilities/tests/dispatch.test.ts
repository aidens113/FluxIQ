// Asking the panel for something, in the shape a person actually asks.

import { describe, expect, it, vi } from "vitest";
import type { ProgramCommandTransport } from "../../../data/program-transport";
import { conversationCapabilityTurnText, runConversationCapability } from "../../turn-commands";
import { dispatchPanelCapability, panelCapabilityArguments, resolvePanelCapability } from "../index";
import { panelCapability } from "../registry";

function transport(answer: { ok: boolean; payload?: unknown; error?: string } = { ok: true }): {
  api: ProgramCommandTransport;
  calls: Array<{ endpoint: string; payload: Record<string, unknown> }>;
} {
  const calls: Array<{ endpoint: string; payload: Record<string, unknown> }> = [];
  const post = vi.fn(async (endpoint: string, payload: Record<string, unknown>) => {
    calls.push({ endpoint, payload });
    return answer;
  });
  return { api: { get: vi.fn(), post } as unknown as ProgramCommandTransport, calls };
}

describe("what the panel already has open counts as an argument", () => {
  it("takes the Flow from the screen when the person says only \"run it\"", async () => {
    const { api, calls } = transport({ ok: true, payload: { runSummary: {} } });
    const dispatch = await dispatchPanelCapability(
      { transport: api, projectId: "p1", flowId: "f1" },
      { request: "run it" }
    );
    expect(dispatch.capability?.id).toBe("run.execute");
    expect(dispatch.outcome.status).toBe("done");
    expect(calls[0]?.endpoint).toBe("run-runtime-session");
    expect(calls[0]?.payload).toMatchObject({ projectId: "p1", flowId: "f1" });
  });

  it("leaves a supplied value alone rather than overwriting it from context", () => {
    const capability = panelCapability("run.execute")!;
    const args = panelCapabilityArguments(capability, { transport: transport().api, projectId: "p1", flowId: "onScreen" }, { flowId: "asked-for" });
    expect(args.flowId).toBe("asked-for");
    expect(args.projectId).toBe("p1");
  });

  it("names what is still missing instead of sending a half-formed request", async () => {
    const { api, calls } = transport();
    const dispatch = await dispatchPanelCapability({ transport: api, projectId: "p1" }, { capabilityId: "flow.describe" });
    expect(dispatch.outcome.status).toBe("failed");
    expect(dispatch.outcome.status === "failed" && dispatch.outcome.error).toContain("instruction");
    expect(calls).toHaveLength(0);
  });
});

describe("a name it does not know resolves to the nearest one", () => {
  it("takes an id the catalog does not have as the capability it meant", async () => {
    const { api } = transport();
    const dispatch = await dispatchPanelCapability(
      { transport: api, projectId: "p1", flowId: "f1" },
      { capabilityId: "flow.run" }
    );
    expect(dispatch.capability?.id).toBe("run.execute");
    expect(dispatch.confidence).toBeLessThan(1);
  });

  it("is certain about an id it does know", async () => {
    const { api } = transport();
    const dispatch = await dispatchPanelCapability({ transport: api, projectId: "p1", flowId: "f1" }, { capabilityId: "run.execute" });
    expect(dispatch.confidence).toBe(1);
  });

  it("never refuses a request outright", () => {
    for (const request of ["make the thing go", "zzzz", "", "I want the blue one"]) {
      expect(resolvePanelCapability(request).best, `"${request}" produced no match at all.`).not.toBeNull();
    }
  });

  it("reads the plainer phrasings as the capabilities they name", () => {
    expect(resolvePanelCapability("why did it fail").best?.capability.id).toBe("run.inspect");
    expect(resolvePanelCapability("roll it back").best?.capability.id).toBe("version.rollBack");
    expect(resolvePanelCapability("delete the flow").best?.capability.id).toBe("flow.delete");
    expect(resolvePanelCapability("change a setting").best?.capability.id).toBe("flow.settings");
  });
});

describe("only deleting stops for the person", () => {
  it("asks for the PIN again before it deletes, and sends nothing until it has one", async () => {
    const { api, calls } = transport();
    const dispatch = await dispatchPanelCapability({ transport: api, projectId: "p1", flowId: "f1" }, { capabilityId: "flow.delete" });
    expect(dispatch.outcome.status).toBe("asks");
    expect(dispatch.outcome.status === "asks" && dispatch.outcome.consequences).toEqual(["delete"]);
    expect(calls).toHaveLength(0);
  });

  it("goes through once the person has re-authorized", async () => {
    const { api, calls } = transport();
    const dispatch = await dispatchPanelCapability(
      { transport: api, projectId: "p1", flowId: "f1", authorizationPin: "4321" },
      { capabilityId: "flow.delete" }
    );
    expect(dispatch.outcome.status).toBe("done");
    expect(calls[0]?.payload).toMatchObject({ authorizationPin: "4321" });
  });

  it("changes a setting without asking anybody anything", async () => {
    const { api, calls } = transport();
    const dispatch = await dispatchPanelCapability(
      { transport: api, projectId: "p1", flowId: "f1" },
      { capabilityId: "flow.settings", arguments: { settings: { retryLimit: 5 } } }
    );
    expect(dispatch.outcome.status).toBe("done");
    expect(calls[0]?.endpoint).toBe("update-flow-settings");
    expect(calls[0]?.payload).toMatchObject({ retryLimit: 5 });
  });
});

describe("a failure comes back in Core's own words", () => {
  it("keeps the reason the endpoint gave", async () => {
    const { api } = transport({ ok: false, error: "Unknown Automation Studio project: p9" });
    const dispatch = await dispatchPanelCapability({ transport: api, projectId: "p9", flowId: "f1" }, { capabilityId: "run.execute" });
    expect(dispatch.outcome.status).toBe("failed");
    expect(dispatch.outcome.status === "failed" && dispatch.outcome.error).toBe("Unknown Automation Studio project: p9");
  });

  it("survives a transport that throws, and still says what it was doing", async () => {
    const api = { get: vi.fn(), post: vi.fn(async () => { throw new Error("network down"); }) } as unknown as ProgramCommandTransport;
    const dispatch = await dispatchPanelCapability({ transport: api, projectId: "p1", flowId: "f1" }, { capabilityId: "run.execute" });
    expect(dispatch.outcome.status).toBe("failed");
    expect(dispatch.outcome.summary).toContain("Run a Flow");
    expect(dispatch.outcome.status === "failed" && dispatch.outcome.error).toBe("network down");
  });
});

describe("the thread keeps the record of what was done", () => {
  it("writes a turn after the capability has run", async () => {
    const { api, calls } = transport();
    const dispatch = await runConversationCapability(api, {
      conversationId: "c1",
      request: { capabilityId: "run.execute" },
      context: { projectId: "p1", flowId: "f1" }
    });
    expect(dispatch.outcome.status).toBe("done");
    expect(calls.map((call) => call.endpoint)).toEqual(["run-runtime-session", "append-turn"]);
    expect(calls[1]?.payload).toMatchObject({ projectId: "p1", conversationId: "c1" });
    expect(String(calls[1]?.payload.text)).toContain("Ran the Flow.");
  });

  it("records a refusal too, rather than leaving the person with silence", async () => {
    const { api, calls } = transport({ ok: false, error: "The Flow has no steps yet." });
    await runConversationCapability(api, {
      conversationId: "c1",
      request: { capabilityId: "run.execute" },
      context: { projectId: "p1", flowId: "f1" }
    });
    expect(String(calls[1]?.payload.text)).toContain("The Flow has no steps yet.");
  });

  it("says which capability it took an uncertain request as", () => {
    const capability = panelCapability("run.execute")!;
    expect(conversationCapabilityTurnText({
      capability,
      confidence: 0.6,
      arguments: {},
      outcome: { status: "done", summary: "Ran the Flow." }
    })).toContain('I took that as "Run a Flow"');
    expect(conversationCapabilityTurnText({
      capability,
      confidence: 1,
      arguments: {},
      outcome: { status: "done", summary: "Ran the Flow." }
    })).toBe("Ran the Flow.");
  });
});
