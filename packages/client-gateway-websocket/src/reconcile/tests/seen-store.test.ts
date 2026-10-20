// The command ids a client has received: remembered past their records, newest kept.

import { describe, expect, it } from "vitest";
import { clientGatewayMemoryArea } from "../../storage-area/index.ts";
import { ClientGatewaySeenCommandStore } from "../index.ts";

describe("ClientGatewaySeenCommandStore", () => {
  it("remembers a marked id under the default prefix, and nothing else", async () => {
    const area = clientGatewayMemoryArea();
    const seen = new ClientGatewaySeenCommandStore(area);
    await seen.mark("cmd-1", 10);
    expect(await seen.has("cmd-1")).toBe(true);
    expect(await seen.has("cmd-2")).toBe(false);
    expect(await area.get(null)).toEqual({ "fluxiq.commandSeen.cmd-1": 10 });
  });

  it("keeps ids under the key prefix it is given", async () => {
    const area = clientGatewayMemoryArea();
    await new ClientGatewaySeenCommandStore(area, { keyPrefix: "demo.seen." }).mark("cmd-1", 10);
    expect(await area.get(null)).toEqual({ "demo.seen.cmd-1": 10 });
    expect(await new ClientGatewaySeenCommandStore(area).has("cmd-1")).toBe(false);
  });

  it("forgets the oldest past 64 ids", async () => {
    const area = clientGatewayMemoryArea();
    const seen = new ClientGatewaySeenCommandStore(area);
    for (let index = 0; index < 66; index += 1) await seen.mark(`cmd-${index}`, index);
    expect(await seen.has("cmd-0")).toBe(false);
    expect(await seen.has("cmd-1")).toBe(false);
    expect(await seen.has("cmd-2")).toBe(true);
    expect(await seen.has("cmd-65")).toBe(true);
    expect(Object.keys(await area.get(null))).toHaveLength(64);
  });
});
