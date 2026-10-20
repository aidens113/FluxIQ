import { describe, expect, it } from "vitest";
import type { ClientGatewayClientMessage } from "@fluxiq/contracts/client-gateway";
import { ClientGatewayOutbox, clientGatewayMemoryOutboxStore } from "../index.ts";
import { actionResult, binding, recordingEvent, stateUpdate, stopRecording } from "./messages.ts";

const own = binding("lineage.1", "project.1");
const current = binding("lineage.1", "project.1", null);

describe("ClientGatewayOutbox", () => {
  describe("enqueue and the cap", () => {
    it("answers the queue size after each enqueue", async () => {
      const outbox = new ClientGatewayOutbox(clientGatewayMemoryOutboxStore());
      expect(await outbox.enqueue(stateUpdate(), own)).toBe(1);
      expect(await outbox.enqueue(stateUpdate(), own)).toBe(2);
      expect(await outbox.size()).toBe(2);
    });

    it("keeps the newest entries when the limit is passed", async () => {
      const store = clientGatewayMemoryOutboxStore();
      const outbox = new ClientGatewayOutbox(store, { limit: 3 });
      const messages = [stateUpdate(), stateUpdate(), stateUpdate(), stateUpdate(), stateUpdate()];
      for (const message of messages) await outbox.enqueue(message, own);
      expect(await outbox.size()).toBe(3);
      expect((await store.read()).entries.map((queued) => queued.message.id)).toEqual(messages.slice(-3).map((message) => message.id));
    });

    it("defaults the limit to 1,000", async () => {
      const outbox = new ClientGatewayOutbox(clientGatewayMemoryOutboxStore());
      for (let index = 0; index < 1_005; index += 1) await outbox.enqueue(stateUpdate(), own);
      expect(await outbox.size()).toBe(1_000);
    });

    it("refuses a limit that is not a positive whole number", () => {
      const store = clientGatewayMemoryOutboxStore();
      expect(() => new ClientGatewayOutbox(store, { limit: 0 })).toThrow();
      expect(() => new ClientGatewayOutbox(store, { limit: 1.5 })).toThrow();
      expect(() => new ClientGatewayOutbox(store, { limit: Number.NaN })).toThrow();
    });
  });

  describe("lineage", () => {
    it("reads and sets the stored lineage without touching entries", async () => {
      const store = clientGatewayMemoryOutboxStore();
      const outbox = new ClientGatewayOutbox(store);
      expect(await outbox.lineage()).toBeUndefined();
      await outbox.enqueue(stateUpdate(), own);
      await outbox.setLineage("lineage.2");
      expect(await outbox.lineage()).toBe("lineage.2");
      expect(await outbox.size()).toBe(1);
      expect((await store.read()).lineage).toBe("lineage.2");
    });
  });

  describe("flush", () => {
    it("sends the deliverable entries in order, drops the rest, and empties the queue", async () => {
      const outbox = new ClientGatewayOutbox(clientGatewayMemoryOutboxStore());
      const first = stateUpdate();
      const stale = stateUpdate();
      const otherRecording = recordingEvent("rec.other");
      const last = stateUpdate();
      await outbox.enqueue(first, own);
      await outbox.enqueue(stale, binding("lineage.0", "project.1"));
      await outbox.enqueue(otherRecording, binding("lineage.1", "project.1", "rec.other"));
      await outbox.enqueue(last, own);
      const sent: string[] = [];
      const outcome = await outbox.flush(current, async (message) => {
        sent.push(message.id);
      });
      expect(sent).toEqual([first.id, last.id]);
      expect(outcome).toEqual({ delivered: 2, dropped: 2 });
      expect(await outbox.size()).toBe(0);
    });

    it("delivers a recording that ended in the queue", async () => {
      const outbox = new ClientGatewayOutbox(clientGatewayMemoryOutboxStore());
      const step = recordingEvent("rec.ended");
      const stop = stopRecording("rec.ended");
      await outbox.enqueue(step, binding("lineage.1", "project.1", "rec.ended"));
      await outbox.enqueue(stop, binding("lineage.1", "project.1", "rec.ended"));
      const sent: string[] = [];
      await outbox.flush(current, async (message) => {
        sent.push(message.id);
      });
      expect(sent).toEqual([step.id, stop.id]);
    });

    it("writes the drops before the first send", async () => {
      const store = clientGatewayMemoryOutboxStore();
      const outbox = new ClientGatewayOutbox(store);
      const kept = stateUpdate();
      await outbox.enqueue(stateUpdate(), binding("lineage.0", "project.1"));
      await outbox.enqueue(kept, own);
      let storedAtFirstSend: string[] | undefined;
      await outbox.flush(current, async () => {
        storedAtFirstSend ??= (await store.read()).entries.map((queued) => queued.message.id);
      });
      expect(storedAtFirstSend).toEqual([kept.id]);
    });

    it("keeps only the undelivered matching tail when a send fails, and rethrows", async () => {
      const store = clientGatewayMemoryOutboxStore();
      const outbox = new ClientGatewayOutbox(store);
      const a = stateUpdate();
      const b = stateUpdate();
      const c = stateUpdate();
      await outbox.enqueue(a, own);
      await outbox.enqueue(stateUpdate(), binding("lineage.0", "project.1"));
      await outbox.enqueue(b, own);
      await outbox.enqueue(c, own);
      const failure = new Error("socket closed");
      await expect(outbox.flush(current, async (message) => {
        if (message.id === b.id) throw failure;
      })).rejects.toBe(failure);
      expect((await store.read()).entries.map((queued) => queued.message.id)).toEqual([b.id, c.id]);
    });

    it("keeps the lineage across a flush", async () => {
      const store = clientGatewayMemoryOutboxStore();
      const outbox = new ClientGatewayOutbox(store);
      await outbox.setLineage("lineage.1");
      await outbox.enqueue(stateUpdate(), own);
      await outbox.flush(current, async () => undefined);
      expect(await store.read()).toEqual({ lineage: "lineage.1", entries: [] });
    });

    it("never loses an entry enqueued while a flush is sending", async () => {
      const store = clientGatewayMemoryOutboxStore();
      const outbox = new ClientGatewayOutbox(store);
      await outbox.enqueue(stateUpdate(), own);
      let release!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      let sending!: () => void;
      const started = new Promise<void>((resolve) => { sending = resolve; });
      const flushed = outbox.flush(current, async () => {
        sending();
        await gate;
      });
      await started;
      const late = stateUpdate();
      const enqueued = outbox.enqueue(late, own);
      release();
      await flushed;
      expect(await enqueued).toBe(1);
      expect((await store.read()).entries.map((queued) => queued.message.id)).toEqual([late.id]);
    });

    it("keeps working after a failed flush", async () => {
      const outbox = new ClientGatewayOutbox(clientGatewayMemoryOutboxStore());
      await outbox.enqueue(stateUpdate(), own);
      await expect(outbox.flush(current, async () => { throw new Error("down"); })).rejects.toThrow("down");
      expect(await outbox.enqueue(stateUpdate(), own)).toBe(2);
    });
  });

  describe("actionResult", () => {
    it("answers a queued result of the current lineage only", async () => {
      const outbox = new ClientGatewayOutbox(clientGatewayMemoryOutboxStore());
      await outbox.enqueue(actionResult("command.stale", "succeeded"), binding("lineage.0", "project.1"));
      await outbox.enqueue(actionResult("command.own", "failed"), own);
      expect(await outbox.actionResult("command.stale", "lineage.1")).toBeUndefined();
      expect(await outbox.actionResult("command.own", "lineage.1")).toMatchObject({ commandId: "command.own", status: "failed" });
      expect(await outbox.actionResult("command.missing", "lineage.1")).toBeUndefined();
    });

    it("reads an interrupted status as unknown", async () => {
      const outbox = new ClientGatewayOutbox(clientGatewayMemoryOutboxStore());
      await outbox.enqueue(actionResult("command.cut", "interrupted"), own);
      expect(await outbox.actionResult("command.cut", "lineage.1")).toEqual({ commandId: "command.cut", status: "unknown" });
    });

    it("answers the first queued result for that command", async () => {
      const outbox = new ClientGatewayOutbox(clientGatewayMemoryOutboxStore());
      await outbox.enqueue(actionResult("command.twice", "failed"), own);
      await outbox.enqueue(actionResult("command.twice", "succeeded"), own);
      expect((await outbox.actionResult("command.twice", "lineage.1"))?.status).toBe("failed");
    });
  });

  describe("removeRecordingEvent", () => {
    it("removes the queued recording events with that event id and answers how many", async () => {
      const store = clientGatewayMemoryOutboxStore();
      const outbox = new ClientGatewayOutbox(store);
      const kept: ClientGatewayClientMessage[] = [recordingEvent("rec.current", "event.keep"), stateUpdate()];
      await outbox.enqueue(recordingEvent("rec.current", "event.drop"), own);
      await outbox.enqueue(kept[0]!, own);
      await outbox.enqueue(recordingEvent("rec.current", "event.drop"), binding("lineage.0", "project.1"));
      await outbox.enqueue(kept[1]!, own);
      expect(await outbox.removeRecordingEvent("event.drop")).toBe(2);
      expect((await store.read()).entries.map((queued) => queued.message.id)).toEqual(kept.map((message) => message.id));
      expect(await outbox.removeRecordingEvent("event.absent")).toBe(0);
    });
  });
});
