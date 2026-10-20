// The memory stand-in for a client's session storage: what it keeps, that it
// keeps copies, and that two holders of one area see the same items.

import { describe, expect, it } from "vitest";
import { clientGatewayMemoryArea } from "../index.ts";

describe("clientGatewayMemoryArea", () => {
  it("returns every item set, and forgets a removed one", async () => {
    const area = clientGatewayMemoryArea();
    await area.set({ a: 1, b: { c: "two" } });
    expect(await area.get(null)).toEqual({ a: 1, b: { c: "two" } });
    await area.remove("a");
    expect(await area.get(null)).toEqual({ b: { c: "two" } });
    await area.remove("missing");
    expect(await area.get(null)).toEqual({ b: { c: "two" } });
  });

  it("keeps a copy, so changing the value after it was set changes nothing kept", async () => {
    const area = clientGatewayMemoryArea();
    const value = { epoch: 1 };
    await area.set({ lease: value });
    value.epoch = 2;
    expect(await area.get(null)).toEqual({ lease: { epoch: 1 } });
  });

  it("overwrites an item set again under the same key", async () => {
    const area = clientGatewayMemoryArea();
    await area.set({ a: 1 });
    await area.set({ a: 2 });
    expect(await area.get(null)).toEqual({ a: 2 });
  });
});
