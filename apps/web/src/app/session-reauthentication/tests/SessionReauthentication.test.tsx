import { createElement, useState } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GlobalTopbar } from "../../AuthShell";
import { SessionReauthentication } from "..";
import RootLayout from "../../layout";
import { useProgramApi } from "../../../features/programs/program-api";
import { hasPendingProgramAuthentication, requestProgramAuthentication, resolveProgramAuthentication } from "../../../features/programs/program-auth-recovery";

const auth = vi.hoisted(() => ({ current: vi.fn() }));
vi.mock("../../../lib/auth", () => ({ currentFluxIQUser: auth.current }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("../../GlobalClientGatewayPairing", () => ({ GlobalClientGatewayPairing: () => null }));
vi.mock("../../GlobalConversationPrompt", () => ({ GlobalConversationPrompt: () => null }));
vi.mock("../../../features/programs/shared-ui", async () => {
  const real = await vi.importActual<typeof import("../../../features/programs/shared-ui")>("../../../features/programs/shared-ui");
  const react = await import("react");
  return { ...real, Modal: (props: { children: React.ReactNode; title: string }) => react.createElement("section", { role: "dialog", "aria-label": props.title }, props.children) };
});

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let renderer: ReactTestRenderer | null = null;
let api: ReturnType<typeof useProgramApi>;
let browser: EventTarget & { location: { href: string } };
const response = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const flush = async () => { for (let index = 0; index < 6; index += 1) await Promise.resolve(); };

function Workspace() {
  api = useProgramApi("secret-keys");
  const [draft, setDraft] = useState("unsaved work");
  return <input aria-label="Workspace draft" onChange={(event) => setDraft(event.target.value)} value={draft} />;
}

async function mount() {
  await act(async () => { renderer = create(<><Workspace /><SessionReauthentication /></>); });
}

async function credentials() {
  await act(async () => {
    const fields = renderer!.root.findAllByType("input");
    fields.find((field) => field.props.autoComplete === "username")!.props.onChange({ target: { value: "operator" } });
    fields.find((field) => field.props.autoComplete === "current-password")!.props.onChange({ target: { value: "synthetic-password" } });
  });
}

beforeEach(() => {
  browser = Object.assign(new EventTarget(), { location: { href: "/programs/secret-keys" } });
  vi.stubGlobal("window", browser);
  vi.stubGlobal("CustomEvent", class extends Event { detail: unknown; constructor(name: string, options?: { detail?: unknown }) { super(name); this.detail = options?.detail; } });
  auth.current.mockResolvedValue({ role: { permissions: [] } });
});
afterEach(async () => {
  if (renderer) await act(async () => { renderer!.unmount(); });
  renderer = null;
  resolveProgramAuthentication(false);
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("authenticated root session recovery", () => {
  it("mounts exactly one host beside route content and omits it when signed out", async () => {
    const content = createElement("main", {}, "Route content");
    const authenticated = await RootLayout({ children: content });
    const children = authenticated.props.children.props.children;
    expect(children.filter((child: any) => child?.type === SessionReauthentication)).toHaveLength(1);
    expect(children).toContain(content);
    expect(GlobalTopbar({ user: { displayName: "Operator", roleId: "admin" } }).props.children.some((child: any) => child?.type === SessionReauthentication)).toBe(false);
    auth.current.mockResolvedValue(null);
    const signedOut = await RootLayout({ children: content });
    expect(signedOut.props.children.props.children.filter((child: any) => child?.type === SessionReauthentication)).toHaveLength(0);
  });

  it("opens on a real expired program request and retries once after restoring without replacing a draft", async () => {
    let restored = false;
    const fetch = vi.fn(async (url: string) => {
      if (url === "/api/auth/login") { restored = true; return response(200, { ok: true }); }
      return restored ? response(200, { ok: true, payload: { keys: [] } }) : response(401, { ok: false, error: "Expired" });
    });
    vi.stubGlobal("fetch", fetch);
    await mount();
    let pending!: ReturnType<typeof api.get>;
    await act(async () => { pending = api.get("snapshot"); await flush(); });
    expect(renderer!.root.findAllByProps({ role: "dialog" })).toHaveLength(1);
    await act(async () => { renderer!.root.findByProps({ "aria-label": "Workspace draft" }).props.onChange({ target: { value: "newer unsaved work" } }); });
    await credentials();
    await act(async () => { await renderer!.root.findByType("form").props.onSubmit({ preventDefault() {} }); });
    await expect(pending).resolves.toMatchObject({ ok: true, payload: { keys: [] } });
    expect(fetch.mock.calls.filter(([url]) => url.includes("secret-keys"))).toHaveLength(2);
    expect(renderer!.root.findAllByProps({ role: "dialog" })).toHaveLength(0);
    expect(renderer!.root.findByProps({ "aria-label": "Workspace draft" }).props.value).toBe("newer unsaved work");
    expect(browser.location.href).toBe("/programs/secret-keys");
    expect(hasPendingProgramAuthentication()).toBe(false);
  });

  it("coalesces concurrent authentication requests and cancellation releases all waiters", async () => {
    await mount();
    let first!: Promise<boolean>; let second!: Promise<boolean>;
    await act(async () => { first = requestProgramAuthentication(); second = requestProgramAuthentication(); });
    expect(first).toBe(second);
    expect(renderer!.root.findAllByProps({ role: "dialog" })).toHaveLength(1);
    const cancel = renderer!.root.findAllByType("button").find((button) => button.children.includes("Keep work open"))!;
    await act(async () => { cancel.props.onClick(); });
    await expect(first).resolves.toBe(false);
    await expect(second).resolves.toBe(false);
    expect(hasPendingProgramAuthentication()).toBe(false);
  });

  it("retries an expired mutation once and applies one successful mutation after restore", async () => {
    let restored = false;
    let successfulMutations = 0;
    const fetch = vi.fn(async (url: string, options: RequestInit) => {
      if (url === "/api/auth/login") { restored = true; return response(200, { ok: true }); }
      expect(options.method).toBe("POST");
      expect(JSON.parse(String(options.body))).toEqual({ id: "synthetic-key", name: "Updated name" });
      if (!restored) return response(401, { ok: false, error: "Expired" });
      successfulMutations += 1;
      return response(200, { ok: true, payload: { id: "synthetic-key" } });
    });
    vi.stubGlobal("fetch", fetch);
    await mount();
    let pending!: ReturnType<typeof api.post>;
    await act(async () => { pending = api.post("update-key", { id: "synthetic-key", name: "Updated name" }); await flush(); });
    expect(renderer!.root.findAllByProps({ role: "dialog" })).toHaveLength(1);
    await credentials();
    await act(async () => { await renderer!.root.findByType("form").props.onSubmit({ preventDefault() {} }); });
    await expect(pending).resolves.toMatchObject({ ok: true });
    expect(fetch.mock.calls.filter(([url]) => url.includes("update-key"))).toHaveLength(2);
    expect(successfulMutations).toBe(1);
    expect(hasPendingProgramAuthentication()).toBe(false);
  });

  it("returns the expired response on cancellation instead of leaving a program read pending", async () => {
    const fetch = vi.fn(async () => response(401, { ok: false, error: "Expired" }));
    vi.stubGlobal("fetch", fetch);
    await mount();
    let pending!: ReturnType<typeof api.get>;
    await act(async () => { pending = api.get("snapshot"); await flush(); });
    const cancel = renderer!.root.findAllByType("button").find((button) => button.children.includes("Keep work open"))!;
    await act(async () => { cancel.props.onClick(); });
    await expect(pending).resolves.toMatchObject({ ok: false, status: 401 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("settles pending recovery on host unmount and ignores a late login result", async () => {
    let finishLogin!: (value: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { finishLogin = resolve; })));
    await mount();
    let first!: Promise<boolean>;
    await act(async () => { first = requestProgramAuthentication(); });
    await credentials();
    let login!: Promise<void>;
    await act(async () => { login = renderer!.root.findByType("form").props.onSubmit({ preventDefault() {} }); });
    await act(async () => { renderer!.unmount(); });
    renderer = null;
    await expect(first).resolves.toBe(false);
    const next = requestProgramAuthentication();
    finishLogin(response(200, { ok: true }));
    await login;
    expect(hasPendingProgramAuthentication()).toBe(true);
    resolveProgramAuthentication(false);
    await expect(next).resolves.toBe(false);
  });

  it("opens a recovery already pending before the root host attaches", async () => {
    const pending = requestProgramAuthentication();
    await mount();
    expect(renderer!.root.findAllByProps({ role: "dialog" })).toHaveLength(1);
    await act(async () => { renderer!.unmount(); });
    renderer = null;
    await expect(pending).resolves.toBe(false);
  });

  it("keeps recovery open with an explicit error when login returns unreadable JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unreadable", { status: 200 })));
    await mount();
    let pending!: Promise<boolean>;
    await act(async () => { pending = requestProgramAuthentication(); });
    await credentials();
    await act(async () => { await renderer!.root.findByType("form").props.onSubmit({ preventDefault() {} }); });
    expect(JSON.stringify(renderer!.toJSON())).toContain("authentication response could not be read");
    expect(hasPendingProgramAuthentication()).toBe(true);
    expect(renderer!.root.findAllByProps({ role: "dialog" })).toHaveLength(1);
    await act(async () => { renderer!.unmount(); });
    renderer = null;
    await expect(pending).resolves.toBe(false);
  });
});
