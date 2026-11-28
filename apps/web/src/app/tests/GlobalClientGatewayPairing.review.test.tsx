import { useSyncExternalStore } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GlobalClientGatewayPairing } from "../GlobalClientGatewayPairing";

// The page's shared gateway subscription, as a store a test moves by hand.
const gateway = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const refresh = vi.fn();
  let state = { status: "live", snapshot: undefined as Record<string, unknown> | undefined, readFailed: false, refused: false, revision: 0 };
  return {
    refresh,
    get: () => state,
    set(change: Partial<typeof state>) {
      state = { ...state, ...change };
      for (const listener of [...listeners]) listener();
    },
    reset() {
      state = { status: "live", snapshot: undefined, readFailed: false, refused: false, revision: 0 };
      refresh.mockClear();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
});
const auth = vi.hoisted(() => ({ request: vi.fn(async () => true) }));

vi.mock("../../features/client-gateway-changes", () => ({
  useGatewayChanges: () => ({ ...useSyncExternalStore(gateway.subscribe, gateway.get), refresh: gateway.refresh })
}));
vi.mock("../../features/programs/program-auth-recovery", () => ({ requestProgramAuthentication: auth.request }));
vi.mock("../../features/programs/shared-ui", () => ({
  Button: (props: any) => <button {...props} />,
  InlineNotice: (props: any) => <aside data-title={props.title}><p>{props.title}</p><p>{props.message}</p>{props.action}</aside>,
  Modal: (props: any) => <section aria-label={props.title} data-modal onClick={undefined}>{props.children}<button data-close onClick={props.onClose}>Close dialog</button></section>
}));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let view: ReactTestRenderer | undefined;

beforeEach(() => {
  gateway.reset();
  auth.request.mockClear();
  vi.stubGlobal("window", { setTimeout, clearTimeout, setInterval, clearInterval });
});
afterEach(() => {
  if (view) act(() => view!.unmount());
  view = undefined;
  vi.unstubAllGlobals();
});

const request = (pairingCode: string, overrides: Record<string, unknown> = {}) => ({
  pairingCode,
  requestedBySessionId: "session.chrome",
  requestedByClientName: "Chrome on Windows",
  expiresAt: Date.now() + 300_000,
  ...overrides
});

const text = () => JSON.stringify(view!.toJSON());
const dialogs = () => view!.root.findAll((node) => node.type === "section" && node.props["data-modal"] === true);
const button = (label: string): ReactTestInstance => view!.root.find((node) => node.type === "button" && node.children.join("") === label);

async function mount(pairings: unknown[]) {
  gateway.set({ snapshot: { pairings } });
  await act(async () => { view = create(<GlobalClientGatewayPairing />); });
}

describe("GlobalClientGatewayPairing with a renewed or closed request", () => {
  // t1095 RC1 follow-up: the gateway renews a lapsed code on the same socket.
  it("a renewed code from the same session updates in place, with no closed notice", async () => {
    await mount([request("111111", { expiresAt: Date.now() + 1_000 })]);
    expect(text()).toContain("111111");
    await act(async () => { gateway.set({ snapshot: { pairings: [request("222222")] } }); });
    expect(dialogs()).toHaveLength(1);
    expect(text()).toContain("222222");
    expect(text()).not.toContain("111111");
    expect(text()).not.toMatch(/Pairing request closed|Previous request|Nothing was paired/u);
  });

  it("still says nothing was paired when the request really ends", async () => {
    await mount([request("111111")]);
    await act(async () => { gateway.set({ snapshot: { pairings: [] } }); });
    expect(text()).toMatch(/Nothing was paired/u);
  });

  // t1095 RC2: closing the dialog used to hide the request for the tab's life.
  it("a dismissed request stays in the Review bar while pending, across a renewed code, and Review reopens it", async () => {
    await mount([request("111111")]);
    await act(async () => { view!.root.find((node) => node.props["data-close"] === true).props.onClick(); });
    expect(dialogs()).toHaveLength(0);
    expect(text()).toContain("Chrome on Windows wants to connect");
    expect(button("Review")).toBeDefined();
    expect(text()).not.toMatch(/Nothing was paired/u);

    // The renewed code is the same request: it stays in the bar and does not pop up again.
    await act(async () => { gateway.set({ snapshot: { pairings: [request("222222")] } }); });
    expect(dialogs()).toHaveLength(0);
    expect(button("Review")).toBeDefined();

    await act(async () => { button("Review").props.onClick(); });
    expect(dialogs()).toHaveLength(1);
    expect(text()).toContain("222222");
    expect(view!.root.findAll((node) => node.type === "button" && node.children.join("") === "Review")).toHaveLength(0);
  });

  it("drops the Review bar once the set-aside request ends, without a closed notice", async () => {
    await mount([request("111111")]);
    await act(async () => { view!.root.find((node) => node.props["data-close"] === true).props.onClick(); });
    await act(async () => { gateway.set({ snapshot: { pairings: [] } }); });
    expect(view!.toJSON()).toBeNull();
  });

  it("opens a request from another client while one waits in the Review bar", async () => {
    await mount([request("111111")]);
    await act(async () => { view!.root.find((node) => node.props["data-close"] === true).props.onClick(); });
    await act(async () => {
      gateway.set({ snapshot: { pairings: [request("111111"), request("333333", { requestedBySessionId: "session.edge", requestedByClientName: "Edge on Mac" })] } });
    });
    expect(dialogs()).toHaveLength(1);
    expect(text()).toContain("333333");
    expect(button("Review")).toBeDefined();
  });
});

describe("GlobalClientGatewayPairing while live updates are closed", () => {
  // t1095 RC3: the "Not live" notice existed only inside an open dialog.
  it("a closed stream shows Not live with no request open, and Reconnect re-opens it", async () => {
    gateway.set({ status: "closed" });
    await mount([]);
    expect(dialogs()).toHaveLength(0);
    expect(text()).toContain("Not live");
    await act(async () => { button("Reconnect").props.onClick(); });
    expect(gateway.refresh).toHaveBeenCalledTimes(1);
    expect(auth.request).not.toHaveBeenCalled();
  });

  it("offers signing in again when the snapshot was refused", async () => {
    gateway.set({ status: "closed", refused: true });
    await mount([]);
    await act(async () => { button("Sign in again").props.onClick(); });
    expect(auth.request).toHaveBeenCalledTimes(1);
    expect(gateway.refresh).not.toHaveBeenCalled();
  });

  it("shows nothing while live with no request", async () => {
    await mount([]);
    expect(view!.toJSON()).toBeNull();
  });

  it("offers Reconnect inside an open dialog while closed", async () => {
    gateway.set({ status: "closed" });
    await mount([request("111111")]);
    expect(dialogs()).toHaveLength(1);
    await act(async () => { button("Reconnect").props.onClick(); });
    expect(gateway.refresh).toHaveBeenCalledTimes(1);
  });
});
