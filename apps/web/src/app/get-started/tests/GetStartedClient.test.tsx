import { createElement } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push }) }));
import { GetStartedClient } from "../GetStartedClient";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// The route renders the live view, so this drives the real hooks
// (useOnboardingSources -> useProgramApi -> fetch) against stubbed endpoints
// rather than injecting sources.
type Responses = { gateway: unknown; keys: unknown };
function stubFetch(responses: Responses) {
  const requested: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    const url = String(input);
    requested.push(url);
    const body = url.startsWith("/api/programs/automation-studio/client-gateway-snapshot") ? responses.gateway
      : url.startsWith("/api/programs/secret-keys/snapshot") ? responses.keys
      : { ok: false, error: `unexpected ${url}` };
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }));
  return requested;
}

const textOf = (node: ReactTestInstance): string => node.children.map((child) => typeof child === "string" ? child : textOf(child)).join("");
const step = (root: ReactTestInstance, id: string) => root.find((node) => node.type === "li" && node.props["data-step"] === id);

let renderer: ReactTestRenderer | null = null;
beforeEach(() => push.mockReset());
afterEach(async () => {
  if (renderer) await act(async () => { renderer!.unmount(); });
  renderer = null;
  vi.unstubAllGlobals();
});

async function render() {
  await act(async () => { renderer = create(createElement(GetStartedClient, { pollMs: 0 })); });
  // Let both snapshot reads settle.
  for (let index = 0; index < 5; index += 1) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  return renderer!;
}

describe("/get-started", () => {
  it("reads both live snapshots and shows the runtime done, pairing current, and the key step blocked", async () => {
    const requested = stubFetch({
      gateway: { ok: true, payload: { enabled: true, sessions: [], pairings: [], webRuntime: { clientGatewayListening: true } } },
      keys: { ok: true, payload: { keys: [] } }
    });
    const view = await render();
    expect(requested.some((url) => url.startsWith("/api/programs/automation-studio/client-gateway-snapshot"))).toBe(true);
    expect(requested.some((url) => url.startsWith("/api/programs/secret-keys/snapshot"))).toBe(true);
    expect(step(view.root, "runtime").props["data-state"]).toBe("done");
    expect(step(view.root, "pairing").props["data-state"]).toBe("current");
    expect(step(view.root, "deepseek-key").props["data-state"]).toBe("blocked");
  });

  it("shows every step done once paired with a global DeepSeek key, and never renders the key", async () => {
    stubFetch({
      gateway: { ok: true, payload: { enabled: true, sessions: [{ sessionId: "s1" }], pairings: [], webRuntime: { clientGatewayListening: true } } },
      keys: { ok: true, payload: { keys: [{ id: "k1", name: "Work key", kind: "llm", provider: "DeepSeek", scope: "global", enabled: true }] } }
    });
    const view = await render();
    for (const id of ["runtime", "pairing", "deepseek-key"]) expect(step(view.root, id).props["data-state"]).toBe("done");
    expect(JSON.stringify(view.toJSON())).not.toMatch(/sk-/);
  });

  it("sends each start option to Automation Studio", async () => {
    stubFetch({ gateway: { ok: true, payload: { sessions: [], webRuntime: { clientGatewayListening: true } } }, keys: { ok: true, payload: { keys: [] } } });
    const view = await render();
    const button = view.root.find((node) => node.type === "button" && textOf(node).startsWith("Show FluxIQ how"));
    act(() => button.props.onClick());
    expect(push).toHaveBeenCalledWith("/programs/automation-studio?start=demonstrate");
  });
});
