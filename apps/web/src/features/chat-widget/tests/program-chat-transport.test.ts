import { describe, expect, it } from "vitest";
import { createProgramChatTransport } from "../transport";
import { fakeProgramApi } from "./fake-program-api";

const OPENED = { conversationId: "conv-1", projectId: "p1", status: "open", subjectKind: "project", subjectId: "p1" };
const REPLY = { ok: true, payload: { response: { decision: { kind: "reply" } } } } as const;

function transportOver(answers: Parameters<typeof fakeProgramApi>[0] = {}, project: string | null = "p1") {
  const api = fakeProgramApi(answers);
  const keys = fakeProgramApi({ snapshot: { ok: true, payload: { keys: [{ id: "k1", name: "Work key", kind: "llm", provider: "anthropic", enabled: true, secret: "sk-never" }, { kind: "llm", enabled: false }] } } });
  const transport = createProgramChatTransport(api, { projectId: () => project ?? undefined, secretKeys: keys });
  return { api, keys, transport };
}

describe("the conversation port", () => {
  it("lists the project's own thread by its subject, the project's id", async () => {
    const { api, transport } = transportOver({ "list-conversations": { ok: true, payload: { conversations: [OPENED] } } });
    const result = await transport.conversation.listThreads({ subjectKind: "project", status: "open", limit: 1 });
    expect(result).toEqual({ ok: true, value: { conversations: [OPENED] } });
    expect(api.sentTo("list-conversations")).toEqual([{ projectId: "p1", status: "open", subjectKind: "project", subjectId: "p1", limit: 1 }]);
  });

  it("lists an automation's thread by its Flow, in the project the query names", async () => {
    const { api, transport } = transportOver({ "list-conversations": { ok: true, payload: { conversations: [] } } });
    await transport.conversation.listThreads({ subjectKind: "flow", subjectId: "flow-7", projectId: "p2", status: "open", limit: 1 });
    expect(api.sentTo("list-conversations")).toEqual([{ projectId: "p2", status: "open", subjectKind: "flow", subjectId: "flow-7", limit: 1 }]);
  });

  it("reads a thread forward from a turn, and from its start when there is none", async () => {
    const { api, transport } = transportOver({ "get-conversation": { ok: true, payload: { conversation: { conversation: OPENED, turns: [], hasMore: false } } } });
    const first = await transport.conversation.readThread({ projectId: "p1", conversationId: "conv-1", sinceTurnId: undefined, limit: 100 });
    await transport.conversation.readThread({ projectId: "p1", conversationId: "conv-1", sinceTurnId: "t9", limit: 100 });
    expect(first.ok).toBe(true);
    expect(api.sentTo("get-conversation")).toEqual([
      { projectId: "p1", conversationId: "conv-1", limit: 100 },
      { projectId: "p1", conversationId: "conv-1", sinceTurnId: "t9", limit: 100 }
    ]);
  });

  it("sends into a thread as an instruction Core reads, with what is on screen", async () => {
    const { api, transport } = transportOver({ "append-turn": REPLY });
    const result = await transport.conversation.send({ text: " Run it ", conversationId: "conv-1", projectId: "p1", onScreen: { flowId: "flow-7" } });
    expect(result).toEqual({ ok: true, value: {} });
    const [payload] = api.sentTo("append-turn");
    expect(payload).toMatchObject({ projectId: "p1", conversationId: "conv-1", text: "Run it", onScreen: { flowId: "flow-7" } });
    expect(Array.isArray(payload?.capabilities) && payload.capabilities.length > 0).toBe(true);
    expect(api.sentTo("open-conversation")).toEqual([]);
  });

  it("opens the thread first when there is none, and tells the chat which one", async () => {
    const { api, transport } = transportOver({ "open-conversation": { ok: true, payload: { conversation: OPENED } }, "append-turn": REPLY });
    const result = await transport.conversation.send({ text: "Find lamps", conversationId: undefined, projectId: undefined, title: "Lamps" });
    expect(result).toEqual({ ok: true, value: { conversation: OPENED } });
    expect(api.sentTo("open-conversation")).toEqual([{ projectId: "p1", subjectKind: "project", subjectId: "p1", title: "Lamps" }]);
    expect(api.sentTo("append-turn")[0]).toMatchObject({ conversationId: "conv-1", text: "Find lamps" });
    expect(api.calls.map((call) => call.endpoint)).toEqual(["open-conversation", "append-turn"]);
  });

  it("opens an automation's thread about its Flow", async () => {
    const { api, transport } = transportOver({ "open-conversation": { ok: true, payload: { conversation: OPENED } }, "append-turn": REPLY });
    await transport.conversation.send({ text: "Run it", conversationId: undefined, projectId: "p1", subjectKind: "flow", subjectId: "flow-7" });
    expect(api.sentTo("open-conversation")).toEqual([{ projectId: "p1", subjectKind: "flow", subjectId: "flow-7" }]);
  });

  it("answers a failure, never throws, when the open or the message is refused", async () => {
    const refusedOpen = transportOver({ "open-conversation": { ok: false, status: 403, code: "permission_denied", error: "Not allowed." } });
    expect(await refusedOpen.transport.conversation.send({ text: "hi", conversationId: undefined, projectId: "p1" })).toMatchObject({ ok: false, code: "permission_denied", sentence: "Not allowed." });
    expect(refusedOpen.api.sentTo("append-turn")).toEqual([]);

    const refusedTurn = transportOver({ "append-turn": { ok: false, status: 500, error: "Core is busy." } });
    expect(await refusedTurn.transport.conversation.send({ text: "hi", conversationId: "conv-1", projectId: "p1" })).toMatchObject({ ok: false, code: "failed", sentence: "Core is busy." });
  });

  it("refuses an empty message and a missing project before it asks Core anything", async () => {
    const { api, transport } = transportOver({}, null);
    expect(await transport.conversation.send({ text: "   ", conversationId: "c", projectId: "p1" })).toMatchObject({ ok: false, code: "invalid_request" });
    expect(await transport.conversation.send({ text: "hi", conversationId: "c", projectId: undefined })).toMatchObject({ ok: false, code: "no_project" });
    expect(await transport.conversation.listThreads({ subjectKind: "project", status: "open", limit: 1 })).toMatchObject({ ok: false, code: "no_project" });
    expect(api.calls).toEqual([]);
  });

  it("answers an ask flat, as Core's handler reads it", async () => {
    const { api, transport } = transportOver({ "answer-ask": { ok: true, payload: { ask: { askId: "a1" } } } });
    expect(await transport.conversation.answer({ askId: "a1", kind: "choice", value: "done", projectId: "p1" })).toEqual({ ok: true, value: { ask: { askId: "a1" } } });
    await transport.conversation.answer({ askId: "a2", kind: "grant", value: undefined, projectId: undefined });
    expect(api.sentTo("answer-ask")).toEqual([
      { projectId: "p1", askId: "a1", kind: "choice", value: "done" },
      { projectId: "p1", askId: "a2", kind: "grant" }
    ]);
  });

  it("says a permission that needs the PIN is for the Studio to confirm", async () => {
    const { transport } = transportOver({ "answer-ask": { ok: false, status: 403, requiresRecheck: true, code: "pin_required", error: "Enter your PIN." } });
    expect(await transport.conversation.answer({ askId: "a1", kind: "grant", value: undefined, projectId: "p1" })).toMatchObject({ ok: false, code: "pin_required", sentence: "Enter your PIN." });
  });
});

describe("how a failure reaches the chat", () => {
  const cases: Array<[string, Record<string, unknown>, string]> = [
    ["the panel's API was not reached", { status: 0, code: "request_failed", error: "Program request could not be completed." }, "unreachable"],
    ["the API timed out", { status: 504 }, "timed_out"],
    ["the session was refused", { status: 401, code: "authentication_required" }, "refused"],
    ["the request was malformed", { status: 400, code: "invalid_request", error: "Say which conversation." }, "invalid_request"],
    ["Core gave a diagnostic code", { status: 409, code: "automation.instructions_required", error: "Instructions first." }, "automation.instructions_required"],
    ["Core gave no code", { status: 500 }, "failed"]
  ];
  for (const [name, response, code] of cases) {
    it(`maps ${name} to ${code}`, async () => {
      const { transport } = transportOver({ "get-conversation": { ok: false, ...response } });
      const result = await transport.conversation.readThread({ projectId: "p1", conversationId: "c", sinceTurnId: undefined, limit: 1 });
      expect(result).toMatchObject({ ok: false, code });
      expect(result.ok === false && result.sentence.length > 0).toBe(true);
    });
  }

  it("answers a cancelled request as a failure", async () => {
    const { transport } = transportOver({ "get-conversation": { ok: false, aborted: true, status: 0, code: "request_aborted" } });
    expect(await transport.conversation.readThread({ projectId: "p1", conversationId: "c", sinceTurnId: undefined, limit: 1 })).toMatchObject({ ok: false, code: "failed", sentence: "The request was cancelled." });
  });
});

describe("the run port", () => {
  it("stops a build through its Flow and a run through its id", async () => {
    const { api, transport } = transportOver({ "cancel-flow-bootstrap": { ok: true, payload: { cancellationRequested: false } }, "cancel-runtime-session": { ok: true, payload: { runtimeSession: {} } } });
    expect(await transport.runs.stop({ projectId: "p1", flowId: "flow-7" })).toEqual({ ok: true, value: { cancellationRequested: false } });
    expect(await transport.runs.stop({ projectId: "p1", runId: "run-3" })).toEqual({ ok: true, value: {} });
    expect(api.sentTo("cancel-flow-bootstrap")).toEqual([{ projectId: "p1", flowId: "flow-7" }]);
    expect(api.sentTo("cancel-runtime-session")).toEqual([{ projectId: "p1", runId: "run-3", reason: "Stopped from the chat." }]);
  });

  it("stops every run not over when none is named", async () => {
    const sessions = [{ runId: "r1", status: "running" }, { runId: "r2", status: "succeeded" }, { runId: "r3", status: "waiting" }];
    const { api, transport } = transportOver({ "list-runtime-sessions": { ok: true, payload: { runtimeSessions: sessions } }, "cancel-runtime-session": { ok: true, payload: {} } });
    expect(await transport.runs.stop({ projectId: "p1" })).toEqual({ ok: true, value: {} });
    expect(api.sentTo("list-runtime-sessions")).toEqual([{ projectId: "p1", summaries: true, statuses: ["queued", "running", "waiting", "interrupted"], limit: 25 }]);
    expect(api.sentTo("cancel-runtime-session").map((payload) => payload?.runId)).toEqual(["r1", "r3"]);
  });

  it("refuses a stop that names both, and stops at the first run Core will not cancel", async () => {
    const both = transportOver();
    expect(await both.transport.runs.stop({ projectId: "p1", flowId: "f", runId: "r" })).toMatchObject({ ok: false, code: "invalid_request" });
    expect(both.api.calls).toEqual([]);
    const refusing = transportOver({
      "list-runtime-sessions": { ok: true, payload: { runtimeSessions: [{ runId: "r1", status: "running" }, { runId: "r2", status: "running" }] } },
      "cancel-runtime-session": { ok: false, status: 403, code: "permission_denied", error: "No." }
    });
    expect(await refusing.transport.runs.stop({ projectId: "p1" })).toMatchObject({ ok: false, code: "permission_denied" });
    expect(refusing.api.sentTo("cancel-runtime-session")).toHaveLength(1);
  });

  it("takes over and hands back through the run's control", async () => {
    const { api, transport } = transportOver({ "pause-runtime-session": { ok: true, payload: { runId: "run-3", live: true } }, "resume-runtime-session": { ok: false, status: 409, code: "automation.instructions_required", error: "Needs instructions." } });
    expect(await transport.runs.takeOver({ projectId: "p1", runId: "run-3" })).toEqual({ ok: true, value: { runId: "run-3", live: true } });
    expect(await transport.runs.handBack({ projectId: "p1", runId: "run-3" })).toMatchObject({ ok: false, code: "automation.instructions_required" });
    expect(api.sentTo("pause-runtime-session")).toEqual([{ projectId: "p1", runId: "run-3", takeControl: true }]);
    expect(api.sentTo("resume-runtime-session")).toEqual([{ projectId: "p1", runId: "run-3", afterManualAction: true }]);
  });
});

describe("recordings and model keys", () => {
  it("lists recordings by offset and keeps what the chat shows", async () => {
    const recordings = [{ recordingId: "rec-1", description: "Checks a price", status: "ended", startedAt: 1, endedAt: 2, events: ["large"] }, { description: "no id" }];
    const { api, transport } = transportOver({ "list-recordings": { ok: true, payload: { recordings } } });
    const result = await transport.recordings!.list({ page: 3, pageSize: 20 });
    expect(api.sentTo("list-recordings")).toEqual([{ projectId: "p1", summaries: true, limit: 20, offset: 40 }]);
    expect(result).toEqual({ ok: true, value: { items: [{ id: "rec-1", projectId: "p1", description: "Checks a price", status: "ended", startedAt: 1, endedAt: 2 }] } });
  });

  it("reads only whether a key is enabled, never a name or a value", async () => {
    const { keys, transport } = transportOver();
    const result = await transport.models!.readKeys();
    expect(keys.calls).toEqual([{ method: "get", endpoint: "snapshot", payload: undefined }]);
    expect(result).toEqual({ ok: true, value: { keys: [{ kind: "llm", provider: "anthropic", enabled: true }, { kind: "llm", enabled: false }] } });
    expect(JSON.stringify(result)).not.toMatch(/sk-never|Work key|k1/u);
  });

  it("says nothing about keys when the snapshot has no list, and has no models port without the Secret Keys transport", async () => {
    const api = fakeProgramApi();
    const bare = createProgramChatTransport(api, { projectId: () => "p1", secretKeys: fakeProgramApi({ snapshot: { ok: true, payload: {} } }) });
    expect(await bare.models!.readKeys()).toEqual({ ok: true, value: {} });
    expect(createProgramChatTransport(api, { projectId: () => "p1" }).models).toBeUndefined();
  });
});

describe("what this client does not carry", () => {
  it("leaves out the instructions recovery and the page overlay", () => {
    const { transport } = transportOver();
    expect(transport.runs.openInstructions).toBeUndefined();
    expect(transport.activity.setOverlay).toBeUndefined();
  });
});
