import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientGatewayPort } from "../client-api-types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// t916: the clients view reads when it becomes active and on each gateway
// change signal while it is, never on a timer.
const gateway = vi.hoisted(() => ({ state: { status: "live" as string, snapshot: undefined, readFailed: false, refused: false, revision: 1 }, refresh: vi.fn() }));
vi.mock("../../../client-gateway-changes", () => ({ useGatewayChanges: () => ({ ...gateway.state, refresh: gateway.refresh }) }));

const port = vi.hoisted(() => ({
  querySnapshot: vi.fn(),
  listItems: vi.fn()
}));
vi.mock("../client-api", () => ({ useClientGatewayPort: () => port as unknown as ClientGatewayPort }));

import { useClientGatewayController } from "../useClientGatewayController";

let controller: ReturnType<typeof useClientGatewayController> | undefined;
function Probe(props: { active: boolean }) {
  controller = useClientGatewayController({ active: props.active, projectId: null });
  return null;
}

let renderer: ReactTestRenderer | undefined;
async function mount(active: boolean) {
  await act(async () => { renderer = create(createElement(Probe, { active })); });
}
async function rerender(active: boolean) {
  await act(async () => { renderer!.update(createElement(Probe, { active })); });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "setInterval"] });
  gateway.state = { status: "live", snapshot: undefined, readFailed: false, refused: false, revision: 1 };
  gateway.refresh.mockReset();
  port.querySnapshot.mockReset().mockResolvedValue({ ok: true, payload: { enabled: true, sessions: [], pairings: [], trustedClients: [], auditLog: [] } });
  port.listItems.mockReset().mockResolvedValue({ ok: true, payload: { items: [], page: { total: 0 } } });
});
afterEach(() => {
  if (renderer) act(() => renderer!.unmount());
  renderer = undefined;
  controller = undefined;
  vi.useRealTimers();
});

describe("useClientGatewayController", () => {
  it("reads once when active, again on each change revision, and starts no timer", async () => {
    await mount(true);
    expect(port.querySnapshot).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(port.querySnapshot).toHaveBeenCalledTimes(1);

    gateway.state = { ...gateway.state, revision: 2 };
    await rerender(true);
    expect(port.querySnapshot).toHaveBeenCalledTimes(2);
  });

  it("reads nothing while inactive, and reads when it becomes active again", async () => {
    await mount(false);
    gateway.state = { ...gateway.state, revision: 5 };
    await rerender(false);
    expect(port.querySnapshot).not.toHaveBeenCalled();
    await rerender(true);
    expect(port.querySnapshot).toHaveBeenCalledTimes(1);
  });

  it("says when live updates are off, and Refresh re-opens the stream and reads", async () => {
    gateway.state = { ...gateway.state, status: "closed" };
    await mount(true);
    expect(controller!.liveUpdates).toBe("closed");
    await act(async () => { await controller!.refreshGateway(); });
    expect(gateway.refresh).toHaveBeenCalledOnce();
    expect(port.querySnapshot).toHaveBeenCalledTimes(2);
  });
});
