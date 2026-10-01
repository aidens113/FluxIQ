import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DeploymentSyncSnapshotResponse } from "fluxiq/deployment-sync";
import { DeploymentSyncLive } from "../deployment-sync";

const context = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
vi.mock("../../program-api", () => ({ useProgramApi: () => context.api }));
vi.mock("../../shared-ui", async (original) => ({ ...(await original<typeof import("../../shared-ui")>()), Modal: ({ children, title, onClose }: { children: React.ReactNode; title: string; onClose(): void }) => <div data-modal={title}><button onClick={onClose}>Dismiss</button>{children}</div> }));
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function snapshot(id = "a"): DeploymentSyncSnapshotResponse { return { targets: [{ id, name: id, environment: "local", status: "idle" }], artifacts: [], runs: [], git: { rootDir: "/synthetic", available: true, dirty: false, status: [], branches: [], remotes: [], versions: [{ sha: "version", shortSha: "ver", author: "test", refs: [], message: "synthetic", committedAtMs: 1 }] } }; }
const run = { id: "run-a", targetId: "a", status: "synced", startedAtMs: 1, message: "Acknowledged action" };
let view: ReactTestRenderer | undefined;
const text = (node: unknown): string => Array.isArray(node) ? node.map(text).join("") : typeof node === "object" && node !== null && "children" in node ? text((node as { children: unknown }).children) : typeof node === "string" ? node : "";
const button = (label: string) => view!.root.findAllByType("button").find((item) => text(item.children) === label)!;
async function mount(payload = snapshot()) { context.api = { get: vi.fn().mockResolvedValue({ ok: true, payload }), post: vi.fn().mockResolvedValue({ ok: true, payload: run }) }; await act(async () => { view = create(<DeploymentSyncLive />); }); }
afterEach(async () => { if (view) await act(async () => view!.unmount()); view = undefined; vi.clearAllMocks(); });

describe("Deployment recovery", () => {
  it("Strict Mode cleanup permits a fresh initial read", async () => {
    context.api = { get: vi.fn().mockResolvedValue({ ok: true, payload: snapshot() }), post: vi.fn() };
    await act(async () => { view = create(<StrictMode><DeploymentSyncLive /></StrictMode>); }); expect(button("Dry Run")).toBeDefined(); expect(context.api.post).not.toHaveBeenCalled();
  });
  it("locks same-turn duplicate Dry Run through reconciliation", async () => {
    await mount(); const pending = deferred<unknown>(); context.api.post.mockReturnValue(pending.promise);
    const activate = button("Dry Run").props.onClick;
    await act(async () => { activate(); activate(); });
    expect(context.api.post).toHaveBeenCalledTimes(1); expect(button("Dry Run").props.disabled).toBe(true);
    await act(async () => pending.resolve({ ok: true, payload: run })); expect(button("Dry Run").props.disabled).toBe(false);
  });
  it("masks foreign confirmation and refuses retained old-owner callbacks", async () => {
    await mount(); await act(async () => button("Checkout Branch").props.onClick());
    const confirm = button("Checkout").props.onClick; const refresh = button("Refresh").props.onClick; const old = context.api;
    context.api = { get: vi.fn().mockResolvedValue({ ok: true, payload: snapshot("b") }), post: vi.fn() };
    await act(async () => view!.update(<DeploymentSyncLive />));
    expect(view!.root.findAll((node) => Boolean(node.props["data-modal"]))).toHaveLength(0);
    await act(async () => { confirm(); refresh(); }); expect(old.post).not.toHaveBeenCalled(); expect(old.get).toHaveBeenCalledTimes(1); expect(context.api.post).not.toHaveBeenCalled();
  });
  it("retained Cancel and Confirm cannot act on a newer confirmation", async () => {
    await mount(); await act(async () => button("Checkout Branch").props.onClick()); const cancel = button("Cancel").props.onClick; const confirm = button("Checkout").props.onClick;
    await act(async () => cancel()); await act(async () => button("Checkout Branch").props.onClick());
    await act(async () => { cancel(); confirm(); }); expect(button("Checkout")).toBeDefined(); expect(context.api.post).not.toHaveBeenCalled();
  });
  it("preserves acknowledged action when its snapshot read fails and Retry only reads", async () => {
    await mount(); context.api.get.mockResolvedValue({ ok: false, error: "private synthetic failure" });
    await act(async () => button("Dry Run").props.onClick());
    expect(text(view!.toJSON())).toContain("Acknowledged action"); expect(text(view!.toJSON())).toContain("Snapshot refresh failed"); expect(text(view!.toJSON())).not.toContain("private synthetic failure");
    context.api.get.mockResolvedValue({ ok: true, payload: snapshot() }); await act(async () => button("Retry").props.onClick()); expect(context.api.post).toHaveBeenCalledTimes(1);
  });
  it.each(["refusal", "rejection"])("releases action lock after %s", async (kind) => {
    await mount(); if (kind === "refusal") context.api.post.mockResolvedValue({ ok: false }); else context.api.post.mockRejectedValue(new Error("private"));
    await act(async () => button("Dry Run").props.onClick()); expect(button("Dry Run").props.disabled).toBe(false); expect(text(view!.toJSON())).toContain("Deployment action failed");
    context.api.post.mockResolvedValue({ ok: true, payload: run }); await act(async () => button("Dry Run").props.onClick()); expect(context.api.post).toHaveBeenCalledTimes(2);
  });
  it("unknown git never announces a clean repository", async () => {
    const payload = snapshot(); delete payload.git; await mount(payload); expect(text(view!.toJSON())).not.toContain("Clean");
    await act(async () => button("git").props.onClick()); expect(text(view!.toJSON())).not.toContain("Working tree clean");
  });
  it.each([undefined, { targets: [null], runs: [] }])("invalid success is recoverable rather than empty", async (payload) => {
    await mount(); context.api.get.mockResolvedValue({ ok: true, payload }); await act(async () => button("Refresh").props.onClick());
    expect(text(view!.toJSON())).toContain("Snapshot refresh failed"); expect(button("Dry Run")).toBeDefined();
  });
  it("confirmed target/version removal prevents retained confirmation from mutating", async () => {
    await mount(); await act(async () => button("Rollback").props.onClick()); const confirm = view!.root.findAllByType("button").filter((node) => text(node.children) === "Rollback").at(-1)!.props.onClick;
    const payload = snapshot(); payload.git!.versions = []; context.api.get.mockResolvedValue({ ok: true, payload }); await act(async () => button("Refresh").props.onClick());
    await act(async () => confirm()); expect(context.api.post).not.toHaveBeenCalled();
  });
  it("confirmation captures target rather than following later selection", async () => {
    const payload = snapshot(); payload.targets.push({ id: "b", name: "b", environment: "local", status: "idle" }); await mount(payload);
    await act(async () => button("Checkout Branch").props.onClick()); await act(async () => view!.root.findByType("select").props.onChange({ target: { value: "b" } }));
    await act(async () => button("Checkout").props.onClick()); expect(context.api.post).toHaveBeenCalledWith("sync", { targetId: "a" });
  });
  it("duplicate captured confirmation submits once and holds the lock through deferred read", async () => {
    await mount(); await act(async () => button("Checkout Branch").props.onClick()); const activate = button("Checkout").props.onClick;
    const reconciliation = deferred<unknown>(); context.api.get.mockReturnValue(reconciliation.promise);
    await act(async () => { activate(); activate(); }); expect(context.api.post).toHaveBeenCalledTimes(1); expect(button("Dry Run").props.disabled).toBe(true);
    await act(async () => reconciliation.resolve({ ok: true, payload: snapshot() })); expect(button("Dry Run").props.disabled).toBe(false);
  });
  it.each(["resolve", "reject"])("pending old-domain action %s cannot publish or refresh", async (completion) => {
    await mount(); const old = context.api; const pending = deferred<unknown>(); old.post.mockReturnValue(pending.promise); await act(async () => button("Dry Run").props.onClick());
    context.api = { get: vi.fn().mockResolvedValue({ ok: true, payload: snapshot("b") }), post: vi.fn() }; await act(async () => view!.update(<DeploymentSyncLive />));
    await act(async () => { if (completion === "resolve") pending.resolve({ ok: true, payload: run }); else pending.reject(new Error("private")); });
    expect(old.get).toHaveBeenCalledTimes(1); expect(text(view!.toJSON())).not.toContain("Acknowledged action"); expect(text(view!.toJSON())).not.toContain("Deployment action failed"); expect(button("Dry Run").props.disabled).toBe(false);
  });
  it("same-owner refresh preserves target, history tab and valid detail", async () => {
    const payload = snapshot(); payload.targets.push({ id: "b", name: "b", environment: "local", status: "idle" }); await mount(payload);
    await act(async () => { view!.root.findByType("select").props.onChange({ target: { value: "b" } }); button("verversion").props.onClick(); });
    await act(async () => button("branches").props.onClick()); await act(async () => button("Refresh").props.onClick());
    expect(view!.root.findByType("select").props.value).toBe("b"); expect(text(view!.toJSON())).toContain("Git branches"); expect(text(view!.toJSON())).toContain("Selected Version");
  });
  it("supersedes pre-action read and prevents stale reply from erasing reconciliation", async () => {
    await mount(); const oldRead = deferred<unknown>(); context.api.get.mockReturnValueOnce(oldRead.promise).mockResolvedValue({ ok: true, payload: snapshot("b") });
    await act(async () => button("Refresh").props.onClick()); await act(async () => button("Dry Run").props.onClick());
    await act(async () => oldRead.resolve({ ok: true, payload: snapshot("obsolete") })); expect(view!.root.findByType("select").props.value).toBe("b");
  });
  it("unexpected snapshot rejection retains confirmed state and releases read lock", async () => {
    await mount(); context.api.get.mockRejectedValue(new Error("private")); await act(async () => button("Refresh").props.onClick());
    expect(text(view!.toJSON())).toContain("Snapshot refresh failed"); expect(button("Retry").props.disabled).toBe(false);
    context.api.get.mockResolvedValue({ ok: true, payload: snapshot() }); await act(async () => button("Retry").props.onClick()); expect(text(view!.toJSON())).not.toContain("Snapshot refresh failed");
  });
  it("malformed or wrong-target action success cannot replace a confirmed result", async () => {
    await mount(); await act(async () => button("Dry Run").props.onClick()); context.api.post.mockResolvedValue({ ok: true, payload: { ...run, targetId: "foreign" } });
    await act(async () => button("Dry Run").props.onClick()); expect(text(view!.toJSON())).toContain("Acknowledged action"); expect(text(view!.toJSON())).toContain("Deployment action failed"); expect(button("Dry Run").props.disabled).toBe(false);
  });
  it("unmount and retained callbacks cannot request reconciliation", async () => {
    await mount(); const pending = deferred<unknown>(); context.api.post.mockReturnValue(pending.promise); const activate = button("Dry Run").props.onClick;
    await act(async () => activate()); await act(async () => view!.unmount()); view = undefined;
    await act(async () => { activate(); pending.resolve({ ok: true, payload: run }); }); expect(context.api.post).toHaveBeenCalledTimes(1); expect(context.api.get).toHaveBeenCalledTimes(1);
  });
  it("same-turn manual refresh requests coalesce", async () => {
    await mount(); const pending = deferred<unknown>(); context.api.get.mockReturnValue(pending.promise); const activate = button("Refresh").props.onClick;
    await act(async () => { activate(); activate(); }); expect(context.api.get).toHaveBeenCalledTimes(2);
    await act(async () => pending.resolve({ ok: true, payload: snapshot() }));
  });
  it("removed captured target refuses checkout and clears selection", async () => {
    await mount(); await act(async () => button("Checkout Branch").props.onClick()); const confirm = button("Checkout").props.onClick;
    const payload = snapshot(); payload.targets = []; context.api.get.mockResolvedValue({ ok: true, payload }); await act(async () => button("Refresh").props.onClick());
    await act(async () => confirm()); expect(context.api.post).not.toHaveBeenCalled(); expect(text(view!.toJSON())).toContain("No deployment targets"); expect(view!.root.findByType("select").props.value).toBe("");
  });
  it("malformed selected-version metadata is rejected without replacing confirmed detail", async () => {
    await mount(); await act(async () => button("verversion").props.onClick());
    const payload = snapshot(); context.api.get.mockResolvedValue({ ok: true, payload: { ...payload, git: { ...payload.git, versions: [{ ...payload.git!.versions[0], refs: null }] } } });
    await act(async () => button("Refresh").props.onClick()); expect(text(view!.toJSON())).toContain("Selected Version"); expect(text(view!.toJSON())).toContain("Snapshot refresh failed");
  });
  it("initial missing success payload shows unavailable with usable read Retry", async () => {
    context.api = { get: vi.fn().mockResolvedValue({ ok: true }), post: vi.fn() }; await act(async () => { view = create(<DeploymentSyncLive />); });
    expect(text(view!.toJSON())).toContain("Deployment Sync unavailable"); expect(text(view!.toJSON())).not.toContain("No deployment targets");
    context.api.get.mockResolvedValue({ ok: true, payload: snapshot() }); await act(async () => button("Retry").props.onClick()); expect(button("Dry Run")).toBeDefined(); expect(context.api.post).not.toHaveBeenCalled();
  });
  it("available false suppresses clean success while available clean remains truthful", async () => {
    const payload = snapshot(); payload.git!.available = false; await mount(payload); await act(async () => button("git").props.onClick());
    expect(text(view!.toJSON())).not.toContain("Working tree clean"); expect(text(view!.toJSON())).toContain("Unknown");
    context.api.get.mockResolvedValue({ ok: true, payload: snapshot() }); await act(async () => button("Refresh").props.onClick()); expect(text(view!.toJSON())).toContain("Working tree clean");
  });
});
