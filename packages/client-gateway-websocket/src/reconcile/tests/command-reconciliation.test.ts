// In-flight command reconciliation (Core C8): a record is written before a
// command is carried out and cleared when its result is sent; a record an
// earlier client left is reported as interrupted; a repeated command id is
// answered with what is already in hand, never run; and Core asking what
// became of a command is answered from what was kept, never by acting.
//
// Two clients are two reconciliations over one memory area, which is what a
// client's session storage is to a restarted client. The domain's outcome
// builders are fakes: Core decides when they are used, never what they say.

import { describe, expect, it } from "vitest";
import type { ClientGatewayActionResult } from "@fluxiq/contracts/client-gateway";
import type { JsonObject } from "@fluxiq/contracts/core";
import { clientGatewayMemoryArea, type ClientGatewayStorageArea } from "../../storage-area/index.ts";
import {
  ClientGatewayCommandReconciliation,
  ClientGatewayInFlightRecordStore,
  ClientGatewaySeenCommandStore,
  type ClientGatewayInFlightRecord
} from "../index.ts";

function client(area: ClientGatewayStorageArea, options: { queued?: readonly ClientGatewayActionResult[]; seen?: boolean } = {}) {
  const sent: ClientGatewayActionResult[] = [];
  const store = new ClientGatewayInFlightRecordStore(area);
  const reconciliation = new ClientGatewayCommandReconciliation({
    store,
    ...(options.seen === false ? {} : { seen: new ClientGatewaySeenCommandStore(area) }),
    queuedResult: async (commandId) => options.queued?.find((result) => result.commandId === commandId),
    send: async (result) => {
      sent.push(result);
    },
    commits: (actionType: string, parameters: JsonObject | undefined) => actionType === "demo.press" || parameters?.submit === true,
    interruptedResult: (record: ClientGatewayInFlightRecord, completedAt: number): ClientGatewayActionResult => ({
      commandId: record.commandId,
      status: record.committing ? "unknown" : "failed",
      startedAt: record.startedAt,
      completedAt,
      payload: { commandId: record.commandId, status: "interrupted" }
    }),
    notSeenResult: (commandId: string, at: number): ClientGatewayActionResult => ({
      commandId,
      status: "failed",
      startedAt: at,
      completedAt: at,
      payload: { commandId, status: "not_seen" }
    }),
    now: () => 500
  });
  return { reconciliation, store, sent };
}

const press = { commandId: "cmd-press", actionType: "demo.press", parameters: {} };
const typing = { commandId: "cmd-type", actionType: "demo.type", parameters: { text: "2" } };

function succeeded(commandId: string): ClientGatewayActionResult {
  return { commandId, status: "succeeded", startedAt: 100, completedAt: 200, payload: { commandId, status: "succeeded" } };
}

describe("ClientGatewayCommandReconciliation records", () => {
  it("writes a record before the command is carried out, names where it went, and clears it when its result is sent", async () => {
    const c = client(clientGatewayMemoryArea());
    await c.reconciliation.begin(press, { slot: 7 });
    expect(await c.store.all()).toEqual([{ commandId: "cmd-press", actionType: "demo.press", committing: true, startedAt: 500, place: { slot: 7 } }]);
    await c.reconciliation.placed("cmd-press", { slot: 9, view: "view-9-0" });
    expect(await c.store.read("cmd-press")).toEqual({ commandId: "cmd-press", actionType: "demo.press", committing: true, startedAt: 500, place: { slot: 9, view: "view-9-0" } });
    await c.reconciliation.placed("cmd-press", { slot: 3 });
    expect((await c.store.read("cmd-press"))?.place, "a place replaces the one before it").toEqual({ slot: 3 });
    await c.reconciliation.settled(succeeded("cmd-press"));
    expect(await c.store.all()).toEqual([]);
    expect(c.sent, "settling sends nothing itself: the caller sent the result").toEqual([]);
  });

  it("writes no place when none is given, and placing a command with no record does nothing", async () => {
    const c = client(clientGatewayMemoryArea());
    await c.reconciliation.begin(typing);
    expect(await c.store.read("cmd-type")).toEqual({ commandId: "cmd-type", actionType: "demo.type", committing: false, startedAt: 500 });
    await c.reconciliation.placed("cmd-none", { slot: 1 });
    expect(await c.store.read("cmd-none")).toBeUndefined();
  });

  it("decides committing with the commits dependency, and never keeps a parameter value", async () => {
    const c = client(clientGatewayMemoryArea());
    await c.reconciliation.begin({ ...typing, parameters: { text: "secret-value", submit: true } });
    const [record] = await c.store.all();
    expect(record?.committing).toBe(true);
    expect(JSON.stringify(record)).not.toMatch(/secret-value/u);
  });

  it("reports a leftover record after a restart as interrupted, then clears it", async () => {
    const area = clientGatewayMemoryArea();
    const before = client(area);
    await before.reconciliation.begin(press, { slot: 7 });
    await before.reconciliation.begin(typing, { slot: 7 });
    const after = client(area);
    expect(await after.reconciliation.reportLeftovers()).toBe(2);
    const byId = new Map(after.sent.map((result) => [result.commandId, result]));
    expect(byId.get("cmd-press")).toMatchObject({ status: "unknown", completedAt: 500, payload: { status: "interrupted" } });
    expect(byId.get("cmd-type")).toMatchObject({ status: "failed", payload: { status: "interrupted" } });
    expect(await after.store.all()).toEqual([]);
    expect(await after.reconciliation.reportLeftovers(), "reported once").toBe(0);
  });

  it("does not count a command still running in this client as a leftover", async () => {
    const c = client(clientGatewayMemoryArea());
    await c.reconciliation.begin(press);
    expect(await c.reconciliation.reportLeftovers()).toBe(0);
    expect(c.sent).toEqual([]);
    expect(await c.store.all()).toHaveLength(1);
  });
});

describe("ClientGatewayCommandReconciliation.answerRepeat", () => {
  it("answers a repeated id from what this client has, and lets only a new one run", async () => {
    const queued = succeeded("cmd-queued");
    const c = client(clientGatewayMemoryArea(), { queued: [queued] });
    expect(await c.reconciliation.answerRepeat("cmd-new"), "a new id runs").toBeUndefined();

    await c.reconciliation.begin(press);
    expect(await c.reconciliation.answerRepeat("cmd-press"), "still running: its own result will answer").toBe("running");
    expect(c.sent).toEqual([]);

    const answer = succeeded("cmd-press");
    await c.reconciliation.settled(answer);
    expect(await c.reconciliation.answerRepeat("cmd-press")).toBe("resent");
    expect(c.sent).toEqual([answer]);

    expect(await c.reconciliation.answerRepeat("cmd-queued")).toBe("resent");
    expect(c.sent.at(-1)).toEqual(queued);
  });

  it("answers a repeat of a command an earlier client lost as interrupted, then again from memory", async () => {
    const area = clientGatewayMemoryArea();
    await client(area).reconciliation.begin(press);
    const after = client(area);
    expect(await after.reconciliation.answerRepeat("cmd-press")).toBe("resent");
    expect(after.sent[0]?.status).toBe("unknown");
    expect(await after.store.all()).toEqual([]);
    expect(await after.reconciliation.answerRepeat("cmd-press")).toBe("resent");
    expect(after.sent).toHaveLength(2);
  });

  it("keeps the record of a command whose handler threw, and answers a repeat as interrupted", async () => {
    const c = client(clientGatewayMemoryArea());
    await c.reconciliation.begin(press);
    c.reconciliation.release("cmd-press");
    expect(await c.reconciliation.answerRepeat("cmd-press")).toBe("resent");
    expect(c.sent[0]?.payload?.status).toBe("interrupted");
  });
});

describe("ClientGatewayCommandReconciliation.reconcile", () => {
  it("answers running for a command being carried out here", async () => {
    const c = client(clientGatewayMemoryArea());
    await c.reconciliation.begin(press);
    expect(await c.reconciliation.reconcile("cmd-press")).toEqual({ commandId: "cmd-press", state: "running" });
  });

  it("answers landed with a result just sent, or one waiting in the offline queue", async () => {
    const queued = succeeded("cmd-queued");
    const c = client(clientGatewayMemoryArea(), { queued: [queued] });
    await c.reconciliation.begin(press);
    const result = succeeded("cmd-press");
    await c.reconciliation.settled(result);
    expect(await c.reconciliation.reconcile("cmd-press")).toEqual({ commandId: "cmd-press", state: "landed", result });
    expect(await c.reconciliation.reconcile("cmd-queued")).toEqual({ commandId: "cmd-queued", state: "landed", result: queued });
    expect(c.sent, "answering never sends a result").toEqual([]);
  });

  it("answers unknown for a record an earlier client left without a result", async () => {
    const area = clientGatewayMemoryArea();
    await client(area).reconciliation.begin(press);
    expect(await client(area).reconciliation.reconcile("cmd-press")).toEqual({ commandId: "cmd-press", state: "unknown" });
  });

  it("answers unknown, never not_seen, for a command an earlier client received and answered", async () => {
    const area = clientGatewayMemoryArea();
    const before = client(area);
    await before.reconciliation.begin(press);
    await before.reconciliation.settled(succeeded("cmd-press"));
    expect(await client(area).reconciliation.reconcile("cmd-press")).toEqual({ commandId: "cmd-press", state: "unknown" });
  });

  it("without a seen store, reads a command whose record and result are gone as never received", async () => {
    const area = clientGatewayMemoryArea();
    const before = client(area, { seen: false });
    await before.reconciliation.begin(press);
    await before.reconciliation.settled(succeeded("cmd-press"));
    expect(await client(area, { seen: false }).reconciliation.reconcile("cmd-press")).toEqual({ commandId: "cmd-press", state: "not_seen" });
  });

  it("answers not_seen for a command never received, and refuses a copy arriving afterwards with the not-seen result", async () => {
    const c = client(clientGatewayMemoryArea());
    expect(await c.reconciliation.reconcile("cmd-press")).toEqual({ commandId: "cmd-press", state: "not_seen" });
    expect(await c.reconciliation.answerRepeat("cmd-press")).toBe("refused");
    expect(c.sent).toEqual([{ commandId: "cmd-press", status: "failed", startedAt: 500, completedAt: 500, payload: { commandId: "cmd-press", status: "not_seen" } }]);
    expect(await c.reconciliation.reconcile("cmd-press"), "asked again, still not seen").toEqual({ commandId: "cmd-press", state: "not_seen" });
  });

  it("answers running for a command that has arrived but not yet begun", async () => {
    const c = client(clientGatewayMemoryArea());
    expect(await c.reconciliation.answerRepeat("cmd-press")).toBeUndefined();
    expect(await c.reconciliation.reconcile("cmd-press")).toEqual({ commandId: "cmd-press", state: "running" });
  });

  it("answers running for a command that arrives while the answer is being read", async () => {
    const area = clientGatewayMemoryArea();
    let arrive: (() => Promise<unknown>) | undefined;
    const slow: ClientGatewayStorageArea = {
      get: async (keys) => {
        const arriving = arrive;
        arrive = undefined;
        if (arriving) await arriving();
        return await area.get(keys);
      },
      set: area.set,
      remove: area.remove
    };
    const c = client(slow);
    arrive = async () => await c.reconciliation.answerRepeat("cmd-press");
    expect(await c.reconciliation.reconcile("cmd-press")).toEqual({ commandId: "cmd-press", state: "running" });
  });
});
