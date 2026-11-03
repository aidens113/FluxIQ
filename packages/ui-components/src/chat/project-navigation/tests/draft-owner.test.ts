import assert from "node:assert/strict";
import { test } from "vitest";
import { createProjectDraftOwner } from "../draft-owner.ts";
import type { ChatOwner } from "../../owner-context.ts";
import { messageTransport } from "../../tests/message-transport.ts";

const ANY_REQUEST = { subjectKind: "project", status: "open", limit: 1 } as const;

test("same selected project retains composer owner, switches revoke stale lease, remote validity remains authoritative", async () => {
  let alive = true, calls = 0;
  const remote: ChatOwner = {
    token: {},
    identity: "synthetic-remote",
    current: () => alive,
    transport: messageTransport(async () => {
      calls++;
      return { ok: true, value: {} };
    })
  };
  const owners = createProjectDraftOwner();
  assert.equal(owners.capture(remote, undefined), remote);
  assert.equal(owners.capture(remote, "same", "same"), remote);
  const a = owners.capture(remote, "a");
  assert.equal(owners.capture(remote, "a"), a);
  assert.equal(a.current(), true);
  const b = owners.capture(remote, "b");
  assert.notEqual(a.identity, b.identity);
  assert.equal(a.current(), false);
  assert.equal((await a.transport.conversation.listThreads(ANY_REQUEST)).ok, false);
  assert.equal(calls, 0);
  assert.equal(b.current(), true);
  alive = false;
  assert.equal(b.current(), false);
  assert.equal((await b.transport.conversation.listThreads(ANY_REQUEST)).ok, false);
  assert.equal(calls, 0);
});
