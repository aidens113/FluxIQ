// A client's results port, through the leases the chat reads its transport from:
// `createChatOwnerContext` for its owner, and `createProjectDraftOwner` on top of that
// for a chosen project. Nothing in the chat calls the port yet, so this is as far as
// "reaches the chat" goes today: what the chat holds is the client's port, under a lease.

import assert from "node:assert/strict";
import { test } from "vitest";
import { createFakeChatResultsPort, fakeTaskOutcomes } from "../../testing/index.ts";
import { CONTEXT_CHANGED, leaseTransport } from "../lease-transport.ts";
import { createChatOwnerContext } from "../owner-context.ts";
import type { ChatResult, ChatResultsPort, ChatTransport } from "../ports/index.ts";
import { createProjectDraftOwner } from "../project-navigation/index.ts";
import { hostStatus } from "./host-status.ts";
import { messageTransport } from "./message-transport.ts";

const PROJECT = { projectId: "project-1" };
const bare = messageTransport(async () => ({ ok: true, value: {} }));

function withResults() {
  const { budgetOutPartial, rowsChecked } = fakeTaskOutcomes();
  const port = createFakeChatResultsPort({ threads: [{ conversationId: "thread-1", outcomes: [rowsChecked] }], outcomes: [budgetOutPartial] });
  const transport: ChatTransport = { ...bare, results: port };
  return { port, transport, rowsChecked };
}

/** Every request the port can make, once. */
async function everyRequest(results: ChatResultsPort): Promise<Array<ChatResult<unknown>>> {
  return [
    await results.readThread({ ...PROJECT, conversationId: "thread-1" }),
    await results.readAttempt({ ...PROJECT, attemptId: "attempt-deals-1" }),
    await results.exportRows({ ...PROJECT, runId: "run-deals-1", datasetId: "deals", format: "csv" }),
    await results.runAgain({ ...PROJECT, taskId: "task-deals" }),
    await results.addBudgetAndCarryOn!({ ...PROJECT, attemptId: "attempt-listings-1", addUsd: 1 })
  ];
}

test("a client's results port reaches the chat through its owner's lease", async () => {
  const { port, transport, rowsChecked } = withResults();
  const owner = createChatOwnerContext(transport).capture();
  assert.notEqual(owner.transport.results, undefined);
  const read = await owner.transport.results!.readAttempt({ ...PROJECT, attemptId: "attempt-deals-1" });
  assert.deepEqual(read, { ok: true, value: rowsChecked });
  assert.deepEqual(port.calls, [{ method: "readAttempt", query: { ...PROJECT, attemptId: "attempt-deals-1" } }]);
});

test("every request of the port reaches the client while the lease holds", async () => {
  const { port, transport } = withResults();
  const answers = await everyRequest(createChatOwnerContext(transport).capture().transport.results!);
  assert.deepEqual(answers.map((answer) => answer.ok), [true, true, true, true, true]);
  assert.deepEqual(port.calls.map((call) => call.method), ["readThread", "readAttempt", "exportRows", "runAgain", "addBudgetAndCarryOn"]);
  assert.equal(port.downloads.length, 1);
});

test("it reaches the chat through a chosen project's lease too", async () => {
  const { port, transport } = withResults();
  const remote = createChatOwnerContext(transport).capture();
  const chosen = createProjectDraftOwner().capture(remote, "project-other");
  assert.notEqual(chosen, remote);
  const answers = await everyRequest(chosen.transport.results!);
  assert.deepEqual(answers.map((answer) => answer.ok), [true, true, true, true, true]);
  assert.equal(port.calls.length, 5);
});

test("once the owner changes, every request is answered as changed context and none reaches the client", async () => {
  const { port, transport } = withResults();
  const context = createChatOwnerContext(transport, "owner-a");
  const lease = context.capture();
  context.observe(hostStatus({ connected: true, ownerKey: "owner-b" }));
  const answers = await everyRequest(lease.transport.results!);
  assert.deepEqual(answers, answers.map(() => ({ ok: false, sentence: CONTEXT_CHANGED })));
  assert.equal(port.calls.length, 0);
  assert.equal(port.downloads.length, 0);
});

test("what the client leaves out stays left out", () => {
  assert.equal("results" in leaseTransport(bare, () => true), false);
  const { addBudgetAndCarryOn: _addBudgetAndCarryOn, ...withoutCarryOn } = createFakeChatResultsPort();
  const leased = leaseTransport({ ...bare, results: withoutCarryOn }, () => true);
  assert.notEqual(leased.results, undefined);
  assert.equal("addBudgetAndCarryOn" in leased.results!, false);
});

test("a port that is a class instance keeps its `this`", async () => {
  class Port implements ChatResultsPort {
    private readonly said: ChatResult<never> = { ok: false, sentence: "from this port" };
    async readThread() { return this.said; }
    async readAttempt() { return this.said; }
    async exportRows() { return this.said; }
    async runAgain() { return this.said; }
    async addBudgetAndCarryOn() { return this.said; }
  }
  const answers = await everyRequest(leaseTransport({ ...bare, results: new Port() }, () => true).results!);
  assert.deepEqual(answers, answers.map(() => ({ ok: false, sentence: "from this port" })));
});
