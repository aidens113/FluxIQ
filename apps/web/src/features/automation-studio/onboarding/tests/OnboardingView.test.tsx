import { createElement, useLayoutEffect } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
import { ONBOARDING_COPY, OnboardingView, type OnboardingSources } from "../index";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const NOW = 5_000_000;
const listening = { enabled: true, sessions: [] as Array<{ sessionId: string }>, pairings: [], trustedClients: [], auditLog: [], webRuntime: { clientGatewayListening: true } };

function sources(overrides: Partial<OnboardingSources> = {}): OnboardingSources {
  return {
    loadGatewaySnapshot: vi.fn(async () => ({ ok: true, payload: listening })),
    loadSecretKeys: vi.fn(async () => ({ ok: true, payload: { keys: [] } })),
    ...overrides
  };
}

let renderer: ReactTestRenderer | null = null;
afterEach(async () => {
  if (renderer) await act(async () => { renderer!.unmount(); });
  renderer = null;
});

it("keeps current native setup links and fences obsolete view callbacks", async () => {
  const originalStart = vi.fn(); const originalConnected = vi.fn(); const source = sources();
  const view = await mount(source, originalStart, { onOpenConnectedBrowsers: originalConnected, secretKeysHref: "/programs/secret-keys?domainId=web%2Fteam" });
  const oldStart = view.root.find((node) => node.type === "button" && textOf(node).startsWith("Describe an automation")).props.onClick;
  const oldConnected = view.root.find((node) => node.type === "button" && textOf(node) === "Open Connected browsers").props.onClick;
  const oldRefresh = view.root.find((node) => node.type === "button" && textOf(node) === "Check again").props.onClick;
  const oldLink = view.root.findByType("a").props.onClick;
  expect(view.root.findByType("a").props.href).toBe("/programs/secret-keys?domainId=web%2Fteam");
  const nativeEvent = { ctrlKey: true, metaKey: true, preventDefault: vi.fn() }; oldLink(nativeEvent); expect(nativeEvent.preventDefault).not.toHaveBeenCalled();
  const newStart = vi.fn(); const newConnected = vi.fn(); await act(async () => view.update(<OnboardingView sources={source} onStart={newStart} onOpenConnectedBrowsers={newConnected} pollMs={0} />));
  await act(async () => { oldStart(); oldConnected(); oldRefresh(); oldLink(nativeEvent); });
  expect(originalStart).not.toHaveBeenCalled(); expect(originalConnected).not.toHaveBeenCalled(); expect(newStart).not.toHaveBeenCalled(); expect(newConnected).not.toHaveBeenCalled(); expect(source.loadGatewaySnapshot).toHaveBeenCalledTimes(1); expect(nativeEvent.preventDefault).toHaveBeenCalledTimes(1);
  act(() => view.root.find((node) => node.type === "button" && textOf(node).startsWith("Describe an automation")).props.onClick()); expect(newStart).toHaveBeenCalledWith("describe");
  expect(view.root.findByType("a").props.href).toBe("/programs/secret-keys");
});

it("rejects retained explicit controls during the unmount layout commit", async () => {
  const onStart = vi.fn(); const onConnected = vi.fn(); const source = sources(); let retained: Array<() => void> = [];
  function Parent({ show }: { show: boolean }) { useLayoutEffect(() => { if (!show) retained.forEach((fn) => fn()); }, [show]); return show ? <OnboardingView sources={source} onStart={onStart} onOpenConnectedBrowsers={onConnected} pollMs={0} /> : null; }
  await act(async () => { renderer = create(<Parent show />); });
  retained = renderer!.root.findAllByType("button").map((node) => node.props.onClick);
  await act(async () => renderer!.update(<Parent show={false} />)); expect(onStart).not.toHaveBeenCalled(); expect(onConnected).not.toHaveBeenCalled(); expect(source.loadGatewaySnapshot).toHaveBeenCalledTimes(1);
});

async function mount(source: OnboardingSources, onStart = vi.fn(), extra: Record<string, unknown> = {}) {
  await act(async () => {
    renderer = create(createElement(OnboardingView, { sources: source, onStart, pollMs: 0, now: () => NOW, ...extra }));
  });
  return renderer!;
}
const step = (root: ReactTestInstance, id: string) => root.find((node) => node.type === "li" && node.props["data-step"] === id);
const text = (node: ReactTestInstance | ReactTestRenderer) => JSON.stringify((node as any).toJSON ? (node as ReactTestRenderer).toJSON() : null);
const textOf = (node: ReactTestInstance): string => node.children.map((child) => typeof child === "string" ? child : textOf(child)).join("");

describe("OnboardingView", () => {
  it("renders the three steps with their states, the value message, and the start options", async () => {
    const view = await mount(sources());
    expect(step(view.root, "runtime").props["data-state"]).toBe("done");
    expect(step(view.root, "pairing").props["data-state"]).toBe("current");
    expect(step(view.root, "pairing").props["aria-current"]).toBe("step");
    expect(step(view.root, "deepseek-key").props["data-state"]).toBe("blocked");
    expect(textOf(step(view.root, "deepseek-key"))).toContain("Blocked: finish step 2 first");
    expect(textOf(step(view.root, "pairing"))).toContain("Client pairing request");
    const serialized = text(view);
    expect(serialized).toContain(ONBOARDING_COPY.valueMessage);
    for (const label of ["Describe an automation", "Show FluxIQ how", "Extract data from this page"]) expect(serialized).toContain(label);
  });

  it("emits the chosen start option", async () => {
    const onStart = vi.fn();
    const view = await mount(sources(), onStart);
    const buttons = view.root.findAll((node) => node.type === "button" && textOf(node).startsWith("Extract data from this page"));
    expect(buttons).toHaveLength(1);
    act(() => buttons[0]!.props.onClick());
    expect(onStart).toHaveBeenCalledWith("extract");
    for (const [label, id] of [["Describe an automation", "describe"], ["Show FluxIQ how", "demonstrate"]] as const) {
      act(() => view.root.find((node) => node.type === "button" && textOf(node).startsWith(label)).props.onClick());
      expect(onStart).toHaveBeenLastCalledWith(id);
    }
  });

  it("shows the start command when the runtime is not reachable and the error that stopped it", async () => {
    const view = await mount(sources({ loadGatewaySnapshot: vi.fn(async () => ({ ok: false, error: "connect ECONNREFUSED" })) }));
    const runtime = step(view.root, "runtime");
    expect(runtime.props["data-state"]).toBe("current");
    expect(textOf(runtime)).toContain("pnpm dev");
    expect(textOf(runtime)).toContain("connect ECONNREFUSED");
    expect(step(view.root, "pairing").props["data-state"]).toBe("blocked");
  });

  it("links the key step to Secret Keys and never renders key values", async () => {
    const view = await mount(sources({ loadGatewaySnapshot: vi.fn(async () => ({ ok: true, payload: { ...listening, sessions: [{ sessionId: "s1" }] } })) }));
    const key = step(view.root, "deepseek-key");
    expect(key.props["data-state"]).toBe("current");
    expect(key.findAll((node) => node.type === "a" && node.props.href === "/programs/secret-keys")).toHaveLength(1);
    expect(view.root.findAll((node) => node.type === "input")).toHaveLength(0);
  });

  it("re-checks on demand and offers the Connected browsers view when the host provides it", async () => {
    const loadSecretKeys = vi.fn()
      .mockResolvedValueOnce({ ok: true, payload: { keys: [] } })
      .mockResolvedValue({ ok: true, payload: { keys: [{ id: "k", name: "Mine", kind: "llm", provider: "DeepSeek", scope: "global", enabled: true }] } });
    const loadGatewaySnapshot = vi.fn(async () => ({ ok: true, payload: { ...listening, sessions: [{ sessionId: "s1" }] } }));
    const onOpenConnectedBrowsers = vi.fn();
    const view = await mount(sources({ loadGatewaySnapshot, loadSecretKeys }), vi.fn(), { onOpenConnectedBrowsers });
    expect(step(view.root, "deepseek-key").props["data-state"]).toBe("current");
    await act(async () => view.root.find((node) => node.type === "button" && textOf(node) === "Check again").props.onClick());
    expect(loadSecretKeys).toHaveBeenCalledTimes(2);
    expect(step(view.root, "deepseek-key").props["data-state"]).toBe("done");
    expect(text(view)).toContain("FluxIQ is ready.");

    const unpaired = await (async () => { await act(async () => { renderer!.unmount(); }); renderer = null; return mount(sources(), vi.fn(), { onOpenConnectedBrowsers }); })();
    act(() => step(unpaired.root, "pairing").find((node) => node.type === "button").props.onClick());
    expect(onOpenConnectedBrowsers).toHaveBeenCalledTimes(1);
  });
});
