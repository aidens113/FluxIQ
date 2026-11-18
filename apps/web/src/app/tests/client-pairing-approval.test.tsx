import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GlobalClientGatewayPairing } from "../GlobalClientGatewayPairing";

vi.mock("../../features/programs/shared-ui", () => ({
  Button: (props: any) => <button {...props} />,
  InlineNotice: (props: any) => <p>{props.message}</p>,
  Modal: (props: any) => <section>{props.children}</section>
}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let view: ReactTestRenderer | undefined;

beforeEach(() => {
  vi.stubGlobal("document", { visibilityState: "visible", addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal("window", { setTimeout, clearTimeout, setInterval, clearInterval });
});
afterEach(() => {
  if (view) act(() => view!.unmount());
  view = undefined;
  vi.unstubAllGlobals();
});

it("approves from the authenticated panel with only the pairing reference", async () => {
  const fetcher = vi.fn(async (_url: string, options?: RequestInit) => ({
    ok: true,
    json: async () => options?.method === "POST" ? { ok: true, payload: { session: {} } } : {
      ok: true, payload: { pairings: [{ pairingCode: "reference", requestedBySessionId: "session", expiresAt: Date.now() + 60_000 }] }
    }
  }));
  vi.stubGlobal("fetch", fetcher);
  await act(async () => { view = create(<GlobalClientGatewayPairing />); });
  expect(view!.root.findAllByType("input")).toHaveLength(0);
  expect(JSON.stringify(view!.toJSON())).not.toMatch(/password|unlock|PIN|2FA/iu);
  const approve = view!.root.findAllByType("button").find(button => button.props["data-modal-submit"]);
  expect(approve).toBeDefined();
  await act(async () => approve!.props.onClick());
  const sent = fetcher.mock.calls.find(([, options]) => options?.method === "POST");
  expect(sent?.[0]).toBe("/api/client-gateway/approve-pairing");
  expect(JSON.parse(String(sent?.[1]?.body))).toEqual({ pairingCode: "reference" });
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("lays the request out as labelled lines: client, client id, code and time left, then what approving does", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true,
    json: async () => ({ ok: true, payload: { pairings: [{ pairingCode: "310437", requestedBySessionId: "session", requestedByClientName: "Chrome on Windows", requestedByClientId: "extension-90dd", expiresAt: Date.now() + 60_000 }] } })
  })));
  await act(async () => { view = create(<GlobalClientGatewayPairing />); });
  const terms = view!.root.findAllByType("dt").map((node) => node.children.join(""));
  expect(terms).toEqual(["Client", "Client id", "Code", "Time left"]);
  expect(JSON.stringify(view!.toJSON())).toMatch(/Chrome on Windows.*extension-90dd.*310437/u);
  const effect = view!.root.findByProps({ className: "client-pairing-request-effect" });
  expect(effect.children.join("")).toMatch(/Approving lets that browser use this workspace/u);
});
