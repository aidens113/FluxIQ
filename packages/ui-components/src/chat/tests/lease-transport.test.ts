import assert from "node:assert/strict";
import { test } from "vitest";
import { CONTEXT_CHANGED, leaseTransport } from "../lease-transport.ts";
import type { ChatResult, ChatTransport } from "../ports/index.ts";
import { messageTransport, type TestMessage } from "./message-transport.ts";
import { createFakeChatResultsPort } from "../../testing/index.ts";

const OK: ChatResult<unknown> = { ok: true, value: {} };

/** A transport whose requests are all counted and answered. */
function counting() {
  const sent: TestMessage[] = [];
  const transport = messageTransport(async (message) => {
    sent.push(message);
    return OK;
  });
  return { sent, transport };
}

/** Every request the transport can make, once. */
async function everyRequest(transport: ChatTransport): Promise<Array<ChatResult<unknown>>> {
  const results: Array<ChatResult<unknown>> = [];
  results.push(await transport.conversation.listThreads({ subjectKind: "project", status: "open", limit: 1 }));
  results.push(await transport.conversation.readThread({ projectId: "p", conversationId: "c", sinceTurnId: undefined, limit: 50 }));
  results.push(await transport.conversation.send({ text: "hi", conversationId: undefined, projectId: "p" }));
  results.push(await transport.conversation.answer({ askId: "a", kind: "grant", value: undefined, projectId: "p" }));
  results.push(await transport.activity.read());
  results.push(await transport.activity.setOverlay!("hidden"));
  results.push(await transport.runs.stop({ projectId: "p", runId: "r" }));
  results.push(await transport.runs.takeOver({ projectId: "p", runId: "r" }));
  results.push(await transport.runs.handBack({ projectId: "p", runId: "r" }));
  results.push(await transport.runs.openInstructions!("r"));
  results.push(await transport.recordings!.list({ page: 1, pageSize: 10 }));
  results.push(await transport.models!.readKeys());
  return results;
}

test("while the lease holds every request reaches the client", async () => {
  const { sent, transport } = counting();
  const results = await everyRequest(leaseTransport(transport, () => true));
  assert.equal(results.every((result) => result.ok), true);
  assert.equal(sent.length, 12);
});

test("once the lease lapses every request is answered as changed context and none reaches the client", async () => {
  const { sent, transport } = counting();
  let valid = true;
  const leased = leaseTransport(transport, () => valid);
  valid = false;
  const results = await everyRequest(leased);
  assert.deepEqual(results, results.map(() => ({ ok: false, sentence: CONTEXT_CHANGED })));
  assert.equal(CONTEXT_CHANGED, "This chat context has changed. Try again.");
  assert.equal(sent.length, 0);
});

test("a lapsed lease still hears pushed activity: the feed guards its own lifecycle", () => {
  const listeners: Array<(message: unknown) => void> = [];
  const transport = messageTransport(async () => OK, { listen: (listener) => {
    listeners.push(listener);
    return () => undefined;
  } });
  const heard: unknown[] = [];
  leaseTransport(transport, () => false).activity.subscribe((state) => heard.push(state));
  listeners[0]!({ type: "fluxiq.activity.changed", state: "pushed" });
  assert.deepEqual(heard, ["pushed"]);
});

test("what the client leaves out stays left out", () => {
  const bare = messageTransport(async () => OK, { omit: ["recordings", "models", "openInstructions", "setOverlay"] });
  const leased = leaseTransport(bare, () => true);
  assert.equal(leased.recordings, undefined);
  assert.equal(leased.models, undefined);
  assert.equal(leased.runs.openInstructions, undefined);
  assert.equal(leased.activity.setOverlay, undefined);
});

test("a results port that reports no real spend still says so through the lease", () => {
  const bare = messageTransport(async () => OK);
  const port = createFakeChatResultsPort({ reportsSpend: false });
  assert.equal(leaseTransport({ ...bare, results: port }, () => true).results?.reportsSpend, false);
  assert.equal("reportsSpend" in leaseTransport({ ...bare, results: createFakeChatResultsPort() }, () => true).results!, false);
});

test("New chat, Rename and Delete are leased like the thread list, and left out when the client leaves them out", async () => {
  const bare = messageTransport(async () => OK);
  const asked: unknown[] = [];
  const conversation = {
    ...bare.conversation,
    newThread: async (request: unknown) => {
      asked.push(["new", request]);
      return { ok: true as const, value: {} };
    },
    renameThread: async (request: unknown) => {
      asked.push(["rename", request]);
      return { ok: true as const, value: {} };
    },
    deleteThread: async (request: unknown) => {
      asked.push(["delete", request]);
      return { ok: true as const, value: { deleted: true } };
    }
  };
  let valid = true;
  const leased = leaseTransport({ ...bare, conversation }, () => valid).conversation;
  assert.equal((await leased.newThread!({ projectId: "p", subjectKind: "project" })).ok, true);
  assert.equal((await leased.renameThread!({ conversationId: "c", title: "Named" })).ok, true);
  assert.equal((await leased.deleteThread!({ conversationId: "c", projectId: "p" })).ok, true);
  assert.deepEqual(asked, [["new", { projectId: "p", subjectKind: "project" }], ["rename", { conversationId: "c", title: "Named" }], ["delete", { conversationId: "c", projectId: "p" }]]);
  valid = false;
  assert.deepEqual(await leased.deleteThread!({ conversationId: "c" }), { ok: false, sentence: CONTEXT_CHANGED });
  assert.equal(asked.length, 3, "a lapsed lease sends nothing");
  const plain = leaseTransport(bare, () => true).conversation;
  assert.equal(plain.newThread, undefined);
  assert.equal(plain.renameThread, undefined);
  assert.equal(plain.deleteThread, undefined);
});
