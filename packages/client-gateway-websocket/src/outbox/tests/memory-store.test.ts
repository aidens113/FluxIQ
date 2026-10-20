import { describe, expect, it } from "vitest";
import { clientGatewayMemoryOutboxStore } from "../index.ts";
import { binding, entry, stateUpdate } from "./messages.ts";

describe("clientGatewayMemoryOutboxStore", () => {
  it("starts empty", async () => {
    expect(await clientGatewayMemoryOutboxStore().read()).toEqual({ entries: [] });
  });

  it("keeps what was written, copied so later changes to the written state do not reach it", async () => {
    const store = clientGatewayMemoryOutboxStore();
    const state = { lineage: "lineage.1", entries: [entry(stateUpdate(), binding("lineage.1", null))] };
    await store.write(state);
    state.entries.length = 0;
    state.lineage = "lineage.changed";
    const read = await store.read();
    expect(read.lineage).toBe("lineage.1");
    expect(read.entries).toHaveLength(1);
  });

  it("hands out copies, so a reader cannot change what is stored", async () => {
    const store = clientGatewayMemoryOutboxStore();
    await store.write({ entries: [entry(stateUpdate(), binding("lineage.1", null))] });
    (await store.read()).entries.length = 0;
    expect((await store.read()).entries).toHaveLength(1);
  });
});
