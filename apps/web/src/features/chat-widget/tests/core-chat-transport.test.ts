// The chat transport against Core's real handlers: Core's own
// `AutomationStudioService` on a temporary data directory and Core's own
// endpoint registry, through the same contract world the capability contract
// test uses (`conversation/capabilities/tests/core-contract-world.ts`). No
// model provider is reached by a read, a list, an open, an answer or a stop; a
// send reaches the world's scripted model only, never a paid one.
//
// What it proves that the fake-transport tests cannot: that every field the
// transport sends is a field Core reads, and that Core's own refusals come back
// as failures the chat can read.

import type { ChatActivityState, ChatTransport } from "@fluxiq/ui-components";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeContractSeed, openContractWorld, type ContractWorld } from "../../automation-studio/conversation/capabilities/tests/core-contract-world";
import { createProgramChatTransport } from "../transport";

let world: ContractWorld;
let transport: ChatTransport;

beforeEach(async () => {
  world = await openContractWorld();
  transport = createProgramChatTransport(world.transport, { projectId: () => world.ids.projectId });
}, 120_000);
afterEach(async () => { await world.close(); });
afterAll(async () => { await closeContractSeed(); });

/** The fields of each request to `endpoint` that Core never read. */
function unreadFields(endpoint: string): string[] {
  return world.exchanges
    .filter((exchange) => exchange.endpoint === endpoint)
    .flatMap((exchange) => Object.keys(exchange.sent ?? {}).filter((field) => !exchange.reads.has(field)).map((field) => `${endpoint}.${field}`));
}

describe("the chat transport against Core's real handlers", () => {
  it("lists, opens, sends into, and reads the project's thread, and Core reads every field sent", async () => {
    const none = await transport.conversation.listThreads({ subjectKind: "project", status: "open", limit: 1 });
    expect(none).toEqual({ ok: true, value: { conversations: [] } });

    const sent = await transport.conversation.send({ text: "What can you do here?", conversationId: undefined, projectId: undefined, subjectKind: "project", title: "Chat" });
    if (!sent.ok) throw new Error(`the send failed: ${sent.sentence}`);
    const opened = (sent.value.conversation ?? {}) as { conversationId?: string; subject?: { kind: string; id: string } };
    expect(opened).toMatchObject({ subject: { kind: "project", id: world.ids.projectId } });
    expect(typeof opened.conversationId).toBe("string");

    const listed = await transport.conversation.listThreads({ subjectKind: "project", status: "open", limit: 1 });
    expect(listed.ok && (listed.value.conversations as Array<{ conversationId: string }>).map((thread) => thread.conversationId)).toEqual([opened.conversationId]);

    const read = await transport.conversation.readThread({ projectId: world.ids.projectId, conversationId: opened.conversationId!, sinceTurnId: undefined, limit: 100 });
    if (!read.ok) throw new Error(`the read failed: ${read.sentence}`);
    const thread = read.value.conversation as { turns: Array<{ author: string; text: string }> };
    expect(thread.turns.find((turn) => turn.author === "person")?.text).toBe("What can you do here?");

    expect(["list-conversations", "open-conversation", "append-turn", "get-conversation"].flatMap(unreadFields)).toEqual([]);
  }, 60_000);

  it("answers Core's refusal of an ask that does not exist as a failure the chat can read", async () => {
    const result = await transport.conversation.answer({ askId: "ask-that-never-was", kind: "choice", value: "done", projectId: world.ids.projectId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.sentence.length).toBeGreaterThan(0);
    expect(unreadFields("answer-ask")).toEqual([]);
  }, 60_000);

  it("reads the project's activity as the state the chat draws", async () => {
    const result = await transport.activity.read();
    if (!result.ok) throw new Error(`the read failed: ${result.sentence}`);
    const state = result.value.state as ChatActivityState;
    expect(state).toMatchObject({ overlay: "hidden", live: true });
    expect(Array.isArray(state.recent)).toBe(true);
    expect(unreadFields("get-activity")).toEqual([]);
  }, 60_000);

  it("lists the project's recordings as summaries and stops a run Core holds", async () => {
    const recordings = await transport.recordings!.list({ page: 1, pageSize: 20 });
    expect(recordings.ok && recordings.value.items?.map((item) => item.id)).toContain(world.ids.recordingId);

    const stopped = await transport.runs.stop({ projectId: world.ids.projectId, runId: world.ids.runId });
    expect(stopped.ok).toBe(true);
    expect(["list-recordings", "cancel-runtime-session"].flatMap(unreadFields)).toEqual([]);
  }, 60_000);
});
