import React, { Profiler } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthStatus } from "../AuthShell";

vi.mock("../../features/programs/shared-ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../features/programs/shared-ui")>();
  return { ...actual, Menu: (props: { label: string; options: Array<{ id: string; label: string; disabled?: boolean; href?: string; onSelect?: () => void }> }) => <nav aria-label={props.label}>{props.options.map((option) => option.href ? <a key={option.id} href={option.href}>{option.label}</a> : <button key={option.id} data-action={option.id} disabled={option.disabled} onClick={option.onSelect}>{option.label}</button>)}</nav> };
});

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let view: ReactTestRenderer;
const logout = () => view.root.findByProps({ "data-action": "logout" });
const text = () => JSON.stringify(view.toJSON());
function deferred() { let resolve!: (response: Response) => void, reject!: (error: unknown) => void; return { promise: new Promise<Response>((yes, no) => { resolve = yes; reject = no; }), resolve, reject }; }
async function mount(fetcher: ReturnType<typeof vi.fn>) {
  const location = { href: "https://panel.invalid/programs/background-tasks" };
  vi.stubGlobal("window", { location }); vi.stubGlobal("fetch", fetcher);
  await act(async () => { view = create(<AuthStatus displayName="Synthetic operator" roleId="operator" />); });
  return location;
}
afterEach(() => { if (view) act(() => view.unmount()); vi.unstubAllGlobals(); });

describe("logout acknowledgement and recovery", () => {
  it("locks duplicate activation until an acknowledged response", async () => {
    const pending = deferred(), fetcher = vi.fn(() => pending.promise);
    const location = await mount(fetcher), original = location.href;
    act(() => { const activate = logout().props.onClick; activate(); activate(); });
    expect(fetcher).toHaveBeenCalledTimes(1); expect(logout().props.disabled).toBe(true);
    expect(location.href).toBe(original); expect(text()).toContain("Signing out");
    await act(async () => pending.resolve(new Response(null, { status: 200 })));
    expect(location.href).toBe("/");
    expect(fetcher).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" });
  });
  it("keeps the workspace on refusal and provides usable retry", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response("synthetic-private-error", { status: 503 })).mockResolvedValue(new Response(null, { status: 200 }));
    const location = await mount(fetcher), original = location.href;
    await act(async () => logout().props.onClick());
    expect(location.href).toBe(original); expect(text()).toContain("Sign-out failed");
    expect(text()).not.toContain("synthetic-private-error"); expect(logout().props.disabled).toBe(false);
    const retry = view.root.findAllByType("button").find((node) => node.children.join("") === "Retry sign out")!;
    await act(async () => retry.props.onClick()); expect(location.href).toBe("/"); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("catches unexpected transport rejection and releases the lock", async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error("synthetic-private-error")).mockResolvedValue(new Response(null, { status: 200 }));
    const location = await mount(fetcher), original = location.href;
    await act(async () => logout().props.onClick());
    expect(location.href).toBe(original); expect(text()).toContain("Sign-out failed"); expect(text()).not.toContain("synthetic-private-error");
    expect(logout().props.disabled).toBe(false);
    await act(async () => logout().props.onClick()); expect(location.href).toBe("/");
  });
  it.each(["resolved", "rejected"])("ignores obsolete completion and activation after teardown (%s)", async (outcome) => {
    const pending = deferred(), fetcher = vi.fn(() => pending.promise);
    const location = await mount(fetcher), original = location.href, activate = logout().props.onClick;
    act(() => activate()); act(() => view.unmount());
    await act(async () => { activate(); if (outcome === "resolved") pending.resolve(new Response(null, { status: 200 })); else pending.reject(new Error("synthetic-private-error")); });
    expect(fetcher).toHaveBeenCalledTimes(1); expect(location.href).toBe(original); expect(view.toJSON()).toBeNull();
  });
  it("preserves account navigation and role display", async () => {
    await mount(vi.fn());
    expect(view.root.findByType("a").props.href).toBe("/programs/identity-access"); expect(text()).toContain("operator");
  });
  it("rejects retained activation during unmount commit before passive cleanup", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const location = await mount(fetcher), original = location.href, activate = logout().props.onClick;
    await act(async () => { view.update(<Profiler id="after-removal" onRender={() => activate()}><span>Another workspace</span></Profiler>); });
    expect(fetcher).not.toHaveBeenCalled(); expect(location.href).toBe(original);
  });
});
