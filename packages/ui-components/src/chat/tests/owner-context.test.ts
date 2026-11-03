import assert from "node:assert/strict";
import { test } from "vitest";
import { createChatOwnerContext } from "../owner-context.ts";
import type { ChatResult, ChatThreadListQuery } from "../ports/index.ts";
import { hostStatus } from "./host-status.ts";
import { messageTransport } from "./message-transport.ts";

const QUERY: ChatThreadListQuery = { subjectKind: "project", status: "open", limit: 1 };
const idle = messageTransport(async () => ({ ok: true, value: {} }));
const status = () => hostStatus({ connected: true, ownerKey: "gateway-a|core-a|client-a|project-a" });

test("owner lease changes when the host's owner key changes", () => {
  const context = createChatOwnerContext(idle);
  const original = status();
  context.observe(original);
  const lease = context.capture();
  assert.equal(context.observe({ ...original, ownerKey: "gateway-a|core-b|client-a|project-a" }).changed, true);
  assert.equal(lease.current(), false);
});

test("volatile connection and recording values retain current owner", () => {
  const context = createChatOwnerContext(idle);
  const original = status();
  context.observe(original);
  const lease = context.capture();
  assert.equal(context.observe({ ...original, connected: false, recording: true, projectId: "project-b" }).changed, false);
  assert.equal(lease.current(), true);
});

test("A/B/A never revives a retained request lease and does not cancel dispatched acknowledgement", async () => {
  let calls = 0;
  let finish!: (value: ChatResult<unknown>) => void;
  const context = createChatOwnerContext(messageTransport(() => {
    calls++;
    return new Promise((resolve) => {
      finish = resolve;
    });
  }));
  const original = status();
  context.observe(original);
  const lease = context.capture();
  const dispatched = lease.transport.conversation.listThreads(QUERY);
  context.observe({ ...original, ownerKey: "other" });
  context.observe(original);
  assert.equal(lease.current(), false);
  assert.equal(context.capture().identity, lease.identity);
  assert.equal((await lease.transport.conversation.listThreads(QUERY)).ok, false);
  assert.equal(calls, 1);
  finish({ ok: true, value: "accepted" });
  assert.equal((await dispatched).ok, true);
});

test("a first status under another key retires the unknown context; under the initial key it is not a change", () => {
  const unknown = createChatOwnerContext(idle);
  const before = unknown.capture();
  assert.deepEqual(unknown.observe(status()), { changed: true, initial: true });
  assert.equal(before.current(), false);

  const known = createChatOwnerContext(idle, status().ownerKey);
  const kept = known.capture();
  assert.deepEqual(known.observe(status()), { changed: false, initial: true });
  assert.equal(kept.current(), true);
  assert.deepEqual(known.observe({ ...status(), connected: false }), { changed: false, initial: false });
});
