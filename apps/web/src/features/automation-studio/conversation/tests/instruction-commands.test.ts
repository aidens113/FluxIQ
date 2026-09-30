// What the composer sends, and what the panel does with Core's answer. The
// transport is a double; Core's decision is scripted as the wire answer the
// `append-turn` handler gives.

import { describe, expect, it, vi } from "vitest";
import type { ProgramCommandTransport } from "../../data/program-transport";
import { sendConversationInstruction } from "../instruction-commands";

type Call = { endpoint: string; payload: Record<string, unknown> };

/** A transport that answers `append-turn` with `core`, and everything else with success. */
function transport(core: { ok: boolean; payload?: unknown; error?: string }) {
  const calls: Call[] = [];
  const answer = async (endpoint: string, payload: Record<string, unknown> = {}) => {
    calls.push({ endpoint, payload });
    if (endpoint === "append-turn" && Array.isArray(payload.capabilities)) return core;
    return { ok: true, payload: {} };
  };
  const api = { get: vi.fn(answer), post: vi.fn(answer) } as unknown as ProgramCommandTransport;
  return { api, calls };
}

const RUN_KETTLE = {
  ok: true,
  payload: {
    turn: { turnId: "turn.person" },
    problem: null,
    response: {
      runNow: true,
      askId: null,
      source: "model",
      decision: { kind: "invoke", invocation: { capabilityId: "run.execute", arguments: { projectId: "project.home", flowId: "flow.kettle-1" } } }
    }
  }
};

describe("the composer sends an instruction, not a remark", () => {
  it("hands Core the panel's whole vocabulary and what is on screen", async () => {
    const { api, calls } = transport({ ok: true, payload: { response: { runNow: false, decision: { kind: "reply", text: "Hello." } } } });
    const result = await sendConversationInstruction(api, { projectId: "project.home", conversationId: "c1", text: "hello", onScreen: { flowId: "flow.kettle-1", runId: "" } });

    expect(result).toMatchObject({ ok: true, decision: { kind: "reply" }, dispatch: null, problem: null });
    const sent = calls[0]!;
    expect(sent.endpoint).toBe("append-turn");
    expect(sent.payload).toMatchObject({ projectId: "project.home", conversationId: "c1", text: "hello", onScreen: { flowId: "flow.kettle-1" } });
    expect(sent.payload.onScreen).not.toHaveProperty("runId");
    const vocabulary = sent.payload.capabilities as Array<{ id: string; phrases: string[]; consequences: string[] }>;
    const run = vocabulary.find((capability) => capability.id === "run.execute");
    expect(run?.phrases).toContain("run the flow");
    expect(run?.consequences).toEqual(["create_new"]);
    expect(vocabulary.find((capability) => capability.id === "flow.delete")?.consequences).toContain("delete");
    // Nothing else was sent: a reply runs nothing.
    expect(calls).toHaveLength(1);
  });

  it('runs "run my kettle flow" as Core resolved it, and records the result as the panel', async () => {
    const { api, calls } = transport(RUN_KETTLE);
    const result = await sendConversationInstruction(api, { projectId: "project.home", conversationId: "c1", text: "run my kettle flow" });

    expect(result.dispatch?.capability?.id).toBe("run.execute");
    expect(result.dispatch?.arguments).toMatchObject({ projectId: "project.home", flowId: "flow.kettle-1" });
    expect(result.dispatch?.outcome.status).toBe("done");
    const ran = calls.find((call) => call.endpoint === "run-runtime-session");
    expect(ran?.payload).toMatchObject({ projectId: "project.home", flowId: "flow.kettle-1" });
    const record = calls.at(-1)!;
    expect(record).toMatchObject({ endpoint: "append-turn", payload: { conversationId: "c1", text: "Ran the Flow.", attachmentKind: "panel-capability-result", attachmentRef: "run.execute" } });
    expect(record.payload).not.toHaveProperty("capabilities");
  });

  it("runs nothing that Core is asking the person to confirm first", async () => {
    const { api, calls } = transport({
      ok: true,
      payload: { response: { runNow: false, askId: "panel-command.1", decision: { kind: "invoke", invocation: { capabilityId: "flow.delete", arguments: { flowId: "flow.kettle-1" }, asksFirst: true } } } }
    });
    const result = await sendConversationInstruction(api, { projectId: "project.home", conversationId: "c1", text: "delete the kettle flow" });
    expect(result).toMatchObject({ ok: true, decision: { kind: "invoke", capabilityId: "flow.delete", runNow: false }, dispatch: null });
    expect(calls.map((call) => call.endpoint)).toEqual(["append-turn"]);
  });

  it("runs nothing here when Core ran the capability itself", async () => {
    for (const status of ["done", "started", "failed"] as const) {
      const { api, calls } = transport({
        ok: true,
        payload: {
          ...RUN_KETTLE.payload,
          response: { ...RUN_KETTLE.payload.response, execution: { capabilityId: "run.execute", status, summary: "Running the kettle Flow.", error: status === "failed" ? "No browser." : undefined, runId: "run.1" } }
        }
      });
      const result = await sendConversationInstruction(api, { projectId: "project.home", conversationId: "c1", text: "run my kettle flow" });
      expect(result.dispatch).toBeNull();
      expect(result.execution).toEqual({
        capabilityId: "run.execute",
        status,
        summary: "Running the kettle Flow.",
        ...(status === "failed" ? { error: "No browser." } : {})
      });
      expect(result.decision).toMatchObject({ kind: "invoke", capabilityId: "run.execute", runNow: true });
      expect(calls.map((call) => call.endpoint)).toEqual(["append-turn"]);
    }
  });

  it("runs here what Core did not execute, when it answered with a null execution", async () => {
    const { api, calls } = transport({ ok: true, payload: { ...RUN_KETTLE.payload, response: { ...RUN_KETTLE.payload.response, execution: null } } });
    const result = await sendConversationInstruction(api, { projectId: "project.home", conversationId: "c1", text: "run my kettle flow" });
    expect(result.execution).toBeNull();
    expect(result.dispatch?.capability?.id).toBe("run.execute");
    expect(calls.some((call) => call.endpoint === "run-runtime-session")).toBe(true);
  });

  it("treats an unreadable execution as none, and runs the capability here", async () => {
    const unreadable: unknown[] = [
      "done",
      [],
      { status: "done", summary: "x" },
      { capabilityId: "", status: "done" },
      { capabilityId: "run.execute", status: "finished", summary: "x" },
      { capabilityId: "run.execute" }
    ];
    for (const execution of unreadable) {
      const { api, calls } = transport({ ok: true, payload: { ...RUN_KETTLE.payload, response: { ...RUN_KETTLE.payload.response, execution } } });
      const result = await sendConversationInstruction(api, { projectId: "project.home", conversationId: "c1", text: "run my kettle flow" });
      expect(result.execution).toBeNull();
      expect(result.dispatch?.capability?.id).toBe("run.execute");
      expect(calls.some((call) => call.endpoint === "run-runtime-session")).toBe(true);
    }
  });

  it("keeps the message when it could not be stored, and says so when only the answer could not be written", async () => {
    const refused = await sendConversationInstruction(transport({ ok: false, error: "Conversations require project storage." }).api, { projectId: "p", conversationId: "c", text: "hi" });
    expect(refused).toEqual({ ok: false, error: "Conversations require project storage.", problem: null, decision: null, execution: null, dispatch: null });

    const halfway = await sendConversationInstruction(transport({ ok: true, payload: { response: null, problem: "Your message was saved, but my answer could not be written into the thread: disk full" } }).api, { projectId: "p", conversationId: "c", text: "hi" });
    expect(halfway).toMatchObject({ ok: true, decision: null, problem: expect.stringContaining("Your message was saved") });
  });
});
