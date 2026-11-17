import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../../automation-studio/data/use-program-transport", () => ({ useProgramTransport: () => ({ get: async () => ({ ok: true, status: 200 }), post: async () => ({ ok: true, status: 200 }) }) }));

import { PairedClientsList } from "../../../security/access";
import { ConnectClientSection } from "../ConnectClientSection";
import { connectInfo } from "../connect-info";
import { pendingPairings } from "../pending-pairing";

const NOW = 1_000_000;

describe("pendingPairings", () => {
  it("keeps only live, unapproved requests from a connected client", () => {
    const rows = pendingPairings([
      { pairingCode: "a", referenceCode: "ABC-1", requestedByClientName: "Chrome", requestedBySessionId: "s", expiresAt: NOW + 1 },
      { pairingCode: "expired", requestedBySessionId: "s", expiresAt: NOW - 1 },
      { pairingCode: "done", requestedBySessionId: "s", expiresAt: NOW + 5, consumedAt: 1 },
      { pairingCode: "gone", expiresAt: NOW + 5 }
    ], NOW);
    expect(rows).toEqual([{ pairingCode: "a", reference: "ABC-1", name: "Chrome", expiresAt: NOW + 1 }]);
  });
});

describe("connectInfo", () => {
  it("prefers the discovery document and falls back to the page address and gateway", () => {
    expect(connectInfo({ origin: "https://p.test", gatewayUrl: "wss://p.test/client" }, "ws://x", "http://page").gatewayUrl).toBe("wss://p.test/client");
    const fallback = connectInfo(undefined, "ws://127.0.0.1:4777/client", "http://page");
    expect(fallback).toEqual({ panelAddress: "http://page", gatewayUrl: "ws://127.0.0.1:4777/client", discoveryText: undefined });
  });
});

describe("PairedClientsList", () => {
  it("offers Forget for a client that is no longer active", () => {
    const rows = [{ trustedClientId: "t1", name: "Old", clientType: "browser", status: "revoked", approvedAt: 1, lastUsedAt: 1 }];
    const html = renderToStaticMarkup(createElement(PairedClientsList, { rows, now: 5, onForget: async () => "done" as const, onDone: () => undefined }));
    expect(html).toContain("Forget");
  });
});

function stub(snapshotOk: boolean, discoveryOk = true) {
  vi.stubGlobal("window", { location: { origin: "http://page" } });
  vi.stubGlobal("document", { visibilityState: "visible" });
  const calls: Array<{ url: string; body?: string }> = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { body?: string }) => {
    calls.push({ url, ...(init?.body ? { body: init.body } : {}) });
    if (url === "/.well-known/fluxiq") return new Response(JSON.stringify({ origin: "https://panel.test", gatewayUrl: "wss://panel.test/client" }), { status: discoveryOk ? 200 : 500 });
    if (url === "/api/client-gateway/snapshot") {
      if (!snapshotOk) return new Response("{}", { status: 500 });
      return new Response(JSON.stringify({ ok: true, payload: { pairings: [{ pairingCode: "p1", referenceCode: "R-1", requestedByClientName: "Edge", requestedBySessionId: "s", expiresAt: Date.now() + 60_000 }], trustedClients: [{ trustedClientId: "t1", name: "Laptop", status: "revoked" }] } }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }));
  return calls;
}

// Each render joins the page's one shared gateway subscription; unmounting leaves it, so the next test starts afresh.
const rendered: ReactTestRenderer[] = [];

async function render(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(createElement(ConnectClientSection)); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
  rendered.push(renderer);
  return renderer;
}

afterEach(() => {
  for (const renderer of rendered.splice(0)) act(() => renderer.unmount());
  vi.unstubAllGlobals();
});
const buttons = (r: ReactTestRenderer, label: string) => r.root.findAll((node) => node.type === "button" && node.children.includes(label));

describe("ConnectClientSection", () => {
  it("shows the addresses, a waiting request and every paired client", async () => {
    stub(true);
    const renderer = await render();
    const text = JSON.stringify(renderer.toJSON());
    expect(text).toContain("https://panel.test");
    expect(text).toContain("wss://panel.test/client");
    expect(text).toContain("Edge");
    expect(text).toContain("Laptop");
    expect(buttons(renderer, "Forget")).toHaveLength(1);
  });

  it("approves through the existing route", async () => {
    const calls = stub(true);
    const renderer = await render();
    await act(async () => { buttons(renderer, "Approve")[0]!.props.onClick(); });
    expect(calls.find((call) => call.url === "/api/client-gateway/approve-pairing")?.body).toBe(JSON.stringify({ pairingCode: "p1" }));
  });

  it("dismisses through the existing route", async () => {
    const calls = stub(true);
    const renderer = await render();
    await act(async () => { buttons(renderer, "Dismiss")[0]!.props.onClick(); });
    expect(calls.some((call) => call.url === "/api/client-gateway/dismiss-pairing")).toBe(true);
  });

  it("shows an error with a retry when the gateway cannot be read", async () => {
    stub(false);
    const renderer = await render();
    expect(JSON.stringify(renderer.toJSON())).toContain("Could not read the connection details");
    expect(buttons(renderer, "Try again")).toHaveLength(1);
  });
});

// t916: the page learns of a new request by push, not by reading on a timer.
const settle = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class FakeEventSource {
  static last: FakeEventSource | undefined;
  readyState = 0;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private readonly gatewayListeners: Array<(event: { data: string }) => void> = [];
  private sent = 0;
  constructor(readonly url: string) {
    FakeEventSource.last = this;
  }
  addEventListener(type: string, listener: (event: { data: string }) => void) {
    if (type === "gateway") this.gatewayListeners.push(listener);
  }
  close() {
    this.readyState = 2;
  }
  open() {
    this.readyState = 1;
    this.sent = 0;
    this.onopen?.();
  }
  /** The page's change stream naming a gateway change, numbered as the server numbers its events. */
  change() {
    this.sent += 1;
    for (const listener of this.gatewayListeners) listener({ data: JSON.stringify({ version: this.sent }) });
  }
  giveUp() {
    this.readyState = 2;
    this.onerror?.();
  }
}

describe("ConnectClientSection live updates", () => {
  it("shows a new request when the gateway signals a change, and reads nothing on its own", async () => {
    const calls = stub(true);
    vi.stubGlobal("EventSource", FakeEventSource);
    const renderer = await render();
    const stream = FakeEventSource.last!;
    expect(stream.url).toBe("/api/panel/changes");
    await act(async () => {
      stream.open();
      await settle(20);
    });
    expect(JSON.stringify(renderer.toJSON())).toContain("Edge");
    const reads = () => calls.filter((call) => call.url === "/api/client-gateway/snapshot").length;
    expect(reads()).toBe(1);
    await act(async () => { await settle(100); });
    expect(reads()).toBe(1);
    await act(async () => {
      stream.change();
      await settle(20);
    });
    expect(reads()).toBe(2);
  });

  it("says live updates are off and offers to reconnect when the stream closed", async () => {
    stub(true);
    vi.stubGlobal("EventSource", FakeEventSource);
    const renderer = await render();
    const first = FakeEventSource.last!;
    await act(async () => {
      first.open();
      await settle(20);
    });
    await act(async () => { first.giveUp(); });
    expect(JSON.stringify(renderer.toJSON())).toContain("Live updates are off");
    await act(async () => { buttons(renderer, "Reconnect")[0]!.props.onClick(); });
    expect(FakeEventSource.last).not.toBe(first);
  });
});
