// A recording attached to the message that asks for a Flow becomes supporting
// evidence of that Flow (t770). The registry is faked at the port; what is
// pinned is the calls `flow.createHere` makes, and that a recording the build
// would refuse is refused first, with nothing created.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { AUTOMATION_STUDIO_CONVERSATION_CREATE_HERE } from "../create-here.ts";
import type { AutomationStudioConversationCommandCallResult, AutomationStudioConversationCommandContext } from "../command.ts";

const PROJECT = "project.recording";
type Handler = (payload: Record<string, unknown>) => AutomationStudioConversationCommandCallResult;

function fakePort(handlers: Record<string, Handler>) {
  const calls: Array<{ endpoint: string; payload: Record<string, unknown> }> = [];
  const port: AutomationStudioConversationCommandContext["port"] = {
    async call(endpoint, payload) {
      calls.push({ endpoint, payload });
      return handlers[endpoint]?.(payload) ?? { ok: false, error: `No fake for ${endpoint}.` };
    }
  };
  return { calls, port };
}

/** A thread the command never reads: with no person turn, the instruction is the argument's. */
const HOST: AutomationStudioConversationCommandContext["host"] = {
  async appendAutomationTurn() { throw new Error("The thread is not used here."); },
  async pendingAsks() { return []; },
  async getAsk() { return null; }
};

function contextFor(port: AutomationStudioConversationCommandContext["port"], extra: Partial<AutomationStudioConversationCommandContext> = {}): AutomationStudioConversationCommandContext {
  return { port, host: HOST, projectId: PROJECT, conversationId: "conversation.1", sessionId: "session.person", keyLocked: false, paired: false, startLocation: "https://shop.example/kettles", ...extra };
}

const recording = (over: Record<string, unknown> = {}) => ({ ok: true, payload: { recording: { recordingId: "recording.1", description: "Search for a kettle and read its price.", endedAt: 10, metadata: { projectId: PROJECT }, ...over } } });
const REST: Record<string, Handler> = {
  "create-flow": () => ({ ok: true, payload: { flow: { flowId: "flow.1" } } }),
  "save-flow-generation-instruction": () => ({ ok: true }),
  "generate-flow-bootstrap-adaptation": () => ({ ok: true, payload: { adaptation: { adaptationId: "adaptation.1", status: "proposed" } } }),
  "review-flow-adaptation": (payload) => ({ ok: true, payload: { adaptation: { adaptationId: payload.adaptationId, status: "applied" } } })
};

describe("flow.createHere with an attached recording", () => {
  // The fakes answer a legacy build's proposal and its review.
  beforeEach(() => { vi.stubEnv("FLUXIQ_AUTHORING_MODE", "legacy"); });

  it("links a finished, described recording to the saved instruction and says so", async () => {
    const { port, calls } = fakePort({ ...REST, "get-recording": () => recording() });
    const outcome = await AUTOMATION_STUDIO_CONVERSATION_CREATE_HERE.run(contextFor(port, { attachedRecordingId: "recording.1" }), { instruction: "Find kettles", name: "Kettles" });
    expect(outcome.status).toBe("done");
    expect(calls.map((call) => call.endpoint).slice(0, 3)).toEqual(["get-recording", "create-flow", "save-flow-generation-instruction"]);
    expect(calls[0]?.payload).toEqual({ projectId: PROJECT, recordingId: "recording.1" });
    expect(calls[2]?.payload).toMatchObject({ instruction: "Find kettles", linkedRecordingIds: ["recording.1"] });
  });

  it("says the recording is supporting evidence in how far a Flow that could not be applied got", async () => {
    const { port } = fakePort({ ...REST, "get-recording": () => recording(), "review-flow-adaptation": () => ({ ok: false, error: "The change could not be applied." }) });
    const outcome = await AUTOMATION_STUDIO_CONVERSATION_CREATE_HERE.run(contextFor(port, { attachedRecordingId: "recording.1" }), { instruction: "Find kettles", name: "Kettles" });
    expect(outcome.status).toBe("failed");
    expect(outcome.summary).toContain("saved what it should do, with your recording as supporting evidence");
  });

  it("makes the same calls as before when nothing is attached", async () => {
    const { port, calls } = fakePort({ ...REST, "get-recording": () => recording() });
    await AUTOMATION_STUDIO_CONVERSATION_CREATE_HERE.run(contextFor(port), { instruction: "Find kettles", name: "Kettles" });
    expect(calls.map((call) => call.endpoint)).not.toContain("get-recording");
    expect(calls.find((call) => call.endpoint === "save-flow-generation-instruction")?.payload).not.toHaveProperty("linkedRecordingIds");
  });

  it("never takes the recording from a model-written argument", async () => {
    const { port, calls } = fakePort({ ...REST, "get-recording": () => recording() });
    await AUTOMATION_STUDIO_CONVERSATION_CREATE_HERE.run(contextFor(port), { instruction: "Find kettles", name: "Kettles", recordingId: "recording.9" });
    expect(calls.map((call) => call.endpoint)).not.toContain("get-recording");
    expect(calls.find((call) => call.endpoint === "save-flow-generation-instruction")?.payload).not.toHaveProperty("linkedRecordingIds");
    expect(AUTOMATION_STUDIO_CONVERSATION_CREATE_HERE.capability.arguments.map((argument) => argument.name)).not.toContain("recordingId");
  });

  it.each([
    ["unfinished", recording({ endedAt: undefined }), "is not finished"],
    ["undescribed", recording({ description: "  " }), "has no description"],
    ["from another project", recording({ metadata: { projectId: "project.other" } }), "could not be found in this project"],
    ["missing", { ok: false, error: "Recording not found." }, "could not be found in this project"]
  ])("refuses a recording that is %s without creating a Flow", async (_name, answer, words) => {
    const { port, calls } = fakePort({ ...REST, "get-recording": () => answer as AutomationStudioConversationCommandCallResult });
    const outcome = await AUTOMATION_STUDIO_CONVERSATION_CREATE_HERE.run(contextFor(port, { attachedRecordingId: "recording.1" }), { instruction: "Find kettles", name: "Kettles" });
    expect(outcome.status).toBe("failed");
    expect(outcome.summary).toContain("the recording you attached");
    expect(outcome.summary).toContain(words);
    expect(outcome.summary).toContain("Nothing was changed");
    expect(calls.map((call) => call.endpoint)).toEqual(["get-recording"]);
  });
});
