import type { ClientGatewayChangeListener, ClientGatewayChangesPort } from "fluxiq/client-gateway";
import { describe, expect, it } from "vitest";
import { gatewayChangeTopic, type PanelChange, type PanelChangeSink } from "..";

function port() {
  const listeners = new Set<ClientGatewayChangeListener>();
  const changes: ClientGatewayChangesPort = {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    version: () => 0
  };
  const signal = () => {
    for (const listener of [...listeners]) listener({ kind: "pairing.requested", version: 1 });
  };
  return { changes, signal };
}

function sink() {
  const heard: PanelChange[] = [];
  const baselines: Array<Promise<void>> = [];
  const failures: unknown[] = [];
  const value: PanelChangeSink = {
    changed: (change) => heard.push(change),
    fail: (error) => failures.push(error),
    opensAfter: (baseline) => baselines.push(baseline)
  };
  return { heard, baselines, failures, value };
}

const settled = () => new Promise<void>((resolve) => setImmediate(resolve));

// t1095 RC4: the stream used to open before this topic read its first view. A
// request made after the browser's read on opening but before that first view
// was already in the baseline, so no change followed and the browser never saw it.
describe("gatewayChangeTopic baseline", () => {
  it("holds the stream's opening until its first view is read", async () => {
    const { changes } = port();
    const target = sink();
    let release: () => void = () => undefined;
    let baselined = false;
    gatewayChangeTopic(changes, () => new Promise((resolve) => { release = () => resolve({ pairings: [] }); })).start(target.value);
    expect(target.baselines).toHaveLength(1);
    void target.baselines[0]!.then(() => { baselined = true; });
    await settled();
    expect(baselined).toBe(false);
    release();
    await settled();
    expect(baselined).toBe(true);
  });

  it("a request made between the baseline and the client's read is signalled", async () => {
    const { changes, signal } = port();
    const target = sink();
    const gateway = { pairings: [] as string[] };
    gatewayChangeTopic(changes, async () => ({ pairings: [...gateway.pairings] })).start(target.value);
    // The stream opens once the baseline is in; the browser reads only after that.
    await Promise.all(target.baselines);
    gateway.pairings.push("request.renewed");
    signal();
    await settled();
    expect(target.heard).toEqual([{ topic: "gateway" }]);
  });

  it("lets the stream go on (and fail) when the first view cannot be read", async () => {
    const { changes } = port();
    const target = sink();
    gatewayChangeTopic(changes, async () => { throw new Error("authority lost"); }).start(target.value);
    await Promise.all(target.baselines);
    expect(target.failures).toHaveLength(1);
  });
});
