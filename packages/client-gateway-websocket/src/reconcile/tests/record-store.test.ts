// The in-flight records: one key per command, read field by field, oldest first.

import { describe, expect, it } from "vitest";
import { clientGatewayMemoryArea } from "../../storage-area/index.ts";
import { ClientGatewayInFlightRecordStore } from "../index.ts";

describe("ClientGatewayInFlightRecordStore", () => {
  it("writes one key per command under the default prefix, reads and removes it", async () => {
    const area = clientGatewayMemoryArea();
    const store = new ClientGatewayInFlightRecordStore(area);
    await store.write({ commandId: "cmd-1", actionType: "demo.press", committing: true, startedAt: 5, place: { slot: 2, view: "v-1" } });
    expect(Object.keys(await area.get(null))).toEqual(["fluxiq.inFlight.cmd-1"]);
    expect(await store.read("cmd-1")).toEqual({ commandId: "cmd-1", actionType: "demo.press", committing: true, startedAt: 5, place: { slot: 2, view: "v-1" } });
    await store.remove("cmd-1");
    expect(await store.read("cmd-1")).toBeUndefined();
  });

  it("keeps records under the key prefix it is given", async () => {
    const area = clientGatewayMemoryArea();
    await new ClientGatewayInFlightRecordStore(area, { keyPrefix: "demo.flight." }).write({ commandId: "cmd-1", actionType: "a", committing: false, startedAt: 1 });
    expect(Object.keys(await area.get(null))).toEqual(["demo.flight.cmd-1"]);
    expect(await new ClientGatewayInFlightRecordStore(area).all()).toEqual([]);
  });

  it("lists every record oldest first, leaving values that are not records where they are", async () => {
    const area = clientGatewayMemoryArea();
    const store = new ClientGatewayInFlightRecordStore(area);
    await store.write({ commandId: "late", actionType: "a", committing: false, startedAt: 9 });
    await store.write({ commandId: "early", actionType: "a", committing: false, startedAt: 2 });
    await area.set({ "fluxiq.inFlight.broken": { commandId: "broken" }, "other.key": { commandId: "x", actionType: "a", committing: false, startedAt: 1 } });
    expect((await store.all()).map((record) => record.commandId)).toEqual(["early", "late"]);
    expect(await store.read("broken")).toBeUndefined();
    expect(Object.keys(await area.get(null))).toContain("fluxiq.inFlight.broken");
  });

  it("drops a place that is not a map of strings and numbers, keeping the record", async () => {
    const area = clientGatewayMemoryArea();
    await area.set({ "fluxiq.inFlight.cmd-1": { commandId: "cmd-1", actionType: "a", committing: true, startedAt: 1, place: { slot: { nested: true } } } });
    expect(await new ClientGatewayInFlightRecordStore(area).read("cmd-1")).toEqual({ commandId: "cmd-1", actionType: "a", committing: true, startedAt: 1 });
  });
});
