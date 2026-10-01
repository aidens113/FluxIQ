import React, { Profiler, useLayoutEffect } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RunActionLogViewContent } from "../RunActionLogView";

vi.mock("../../datasets", () => ({ RunDatasetsPanel: () => null }));
vi.mock("../RunDetailPanels", () => ({
  RuntimeAttemptRow: ({ attempt, onSelect }: any) => <button onClick={onSelect}>Attempt {attempt.attemptId}</button>,
  RuntimeActionDetailPanel: ({ attempt, onClose, onView }: any) => <section><pre>{JSON.stringify(attempt)}</pre><button onClick={onClose}>Close action</button><button onClick={() => onView("raw")}>Raw action</button></section>,
  JsonPreview: ({ value }: any) => <pre>{JSON.stringify(value)}</pre>,
  RuntimeLlmAdaptationPanel: () => null, RuntimeRecoveryRoutingPanel: () => null,
  RuntimeRunStateEffectsPanel: () => null, RuntimeRunStory: () => null, RuntimeMetricsPanel: () => null
}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let renderer: ReactTestRenderer | undefined;
let commands: any;
const detail = { summary: { runId: "r", status: "completed" } };
const text = () => JSON.stringify(renderer!.toJSON());
const label = (node: any): string => node.children.map((child: any) => typeof child === "string" ? child : label(child)).join("");
const button = (name: string) => renderer!.root.findAllByType("button").find((node) => node.props["aria-label"] === name || label(node) === name)!;
const page = (actions: any[] = [{ attemptId: "a", metadata: { summaryOnly: true } }], extra = {}) => ({ ok: true, payload: { actions, page: extra } });
function deferred() {
  let resolve!: (value: any) => void;
  let reject!: (value: any) => void;
  return { promise: new Promise<any>((yes, no) => { resolve = yes; reject = no; }), resolve, reject };
}
function view(options: any = {}) {
  return <RunActionLogViewContent projectId="p" runId="r" runDetail={detail} loading={false} error="" onBack={() => {}} commands={commands} {...options} />;
}
async function mount(options: any = {}) { await act(async () => { renderer = create(view(options)); }); }
async function click(name: string) { await act(async () => { button(name).props.onClick(); }); }
beforeEach(() => {
  commands = {
    listActions: vi.fn(async () => page()), listEvents: vi.fn(async () => ({ ok: true, payload: { events: [{ sequence: 1, title: "Event one" }] } })),
    loadDetail: vi.fn(async () => ({ ok: true, payload: { runDetail: detail } })),
    loadActionDetail: vi.fn(async () => ({ ok: true, payload: { action: { attemptId: "a", output: "Full action" } } })),
    loadEventDetail: vi.fn(async () => ({ ok: true, payload: { event: { sequence: 1, title: "Full event" } } })),
    exportAudit: vi.fn(async () => ({ ok: false }))
  };
});
afterEach(() => { if (renderer) act(() => renderer!.unmount()); renderer = undefined; vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Runtime log request recovery", () => {
  it("recovers a rejected action request and retries", async () => {
    commands.listActions.mockRejectedValueOnce(new Error("private transport"));
    await mount();
    expect(text()).toContain("Actions could not be loaded.");
    expect(text()).not.toContain("private transport");
    expect(renderer!.root.findByProps({ className: "automation-runtime-action-log" }).props["aria-busy"]).toBe(false);
    await click("Retry actions");
    expect(button("Attempt a")).toBeDefined();
  });
  it("offers compact-detail retry after rejection when no detail exists", async () => {
    commands.loadDetail.mockRejectedValueOnce(new Error("private compact"));
    await mount({ runDetail: null });
    expect(text()).toContain("Runtime log could not be loaded.");
    expect(button("Retry runtime log").props.disabled).not.toBe(true);
    await click("Retry runtime log");
    expect(button("Export Audit")).toBeDefined();
  });
  it("recovers rejected event reads without exposing transport errors", async () => {
    commands.listEvents.mockRejectedValueOnce(new Error("private event"));
    await mount(); await click("Load Event Stream");
    expect(text()).toContain("Runtime events could not be loaded.");
    expect(button("Load Event Stream").props.disabled).toBe(false);
    await click("Retry events");
    expect(text()).toContain("Event one");
  });
  it("keeps confirmed pagination until success and retries the failed query", async () => {
    commands.listActions.mockResolvedValueOnce(page([{ attemptId: "a" }], { total: 4, limit: 2, hasMore: true, nextCursor: "next" }));
    await mount();
    commands.listActions.mockResolvedValueOnce({ ok: false });
    await click("Next");
    expect(button("Previous").props.disabled).toBe(true);
    expect(text()).toContain("1-2 of 4 actions");
    commands.listActions.mockResolvedValueOnce(page([{ attemptId: "c" }], { total: 4, limit: 2, offset: 2 }));
    await click("Retry actions");
    expect(commands.listActions.mock.calls.at(-1)[0]).toMatchObject({ offset: 2, cursor: "next" });
    expect(text()).toContain("3-4 of 4 actions");
  });
  it("resets command owner and rejects a captured old selection before requests", async () => {
    await mount();
    const staleSelect = button("Attempt a").props.onClick;
    const oldCommands = commands;
    commands = { ...commands, listActions: vi.fn(async () => page([{ attemptId: "new" }])), loadActionDetail: vi.fn() };
    await act(async () => renderer!.update(view()));
    expect(button("Attempt new")).toBeDefined();
    await act(async () => staleSelect());
    expect(oldCommands.loadActionDetail).not.toHaveBeenCalled();
    expect(text()).not.toContain("Summary only");
  });
  it("recovers rejected exports and ignores a captured old export", async () => {
    commands.exportAudit.mockRejectedValueOnce(new Error("private export"));
    await mount(); await click("Export Audit");
    expect(text()).toContain("Audit export could not be prepared.");
    expect(button("Export Audit").props.disabled).toBe(false);
    const staleExport = button("Export Audit").props.onClick;
    await act(async () => renderer!.update(view({ projectId: "other" })));
    const count = commands.exportAudit.mock.calls.length;
    await act(async () => staleExport());
    expect(commands.exportAudit).toHaveBeenCalledTimes(count);
  });

  it.each([null, { ok: true, payload: { actions: {} } }, page([null]), page([], { limit: 0 }), page([], { offset: -1 }), page([], { nextCursor: 3 }), page([], { hasMore: "yes" }), { ok: true, payload: { runId: "wrong", actions: [] } }])("recovers malformed action response %#", async (result) => {
    commands.listActions.mockResolvedValueOnce(result);
    await mount();
    expect(text()).toContain("Actions could not be loaded.");
    await click("Retry actions");
    expect(button("Attempt a")).toBeDefined();
  });
  it.each([null, { ok: true, payload: { events: {} } }, { ok: true, payload: { events: [null] } }, { ok: true, payload: { events: [{ sequence: "1" }] } }, { ok: true, payload: { events: [{ sequence: 1, title: {} }] } }, { ok: true, payload: { events: [], page: { lastSequence: -1 } } }])("recovers malformed event response %#", async (result) => {
    commands.listEvents.mockResolvedValueOnce(result);
    await mount(); await click("Load Event Stream");
    expect(text()).toContain("Runtime events could not be loaded.");
    await click("Retry events");
    expect(text()).toContain("Event one");
  });
  it.each([null, { ok: true, payload: { runDetail: {} } }, { ok: true, payload: { runDetail: { summary: { runId: "wrong" } } } }, { ok: true, payload: { runDetail: { summary: {}, recoveryAttempts: {} } } }])("recovers malformed compact response %#", async (result) => {
    commands.loadDetail.mockResolvedValueOnce(result);
    await mount({ runDetail: null });
    expect(text()).toContain("Runtime log could not be loaded.");
    await click("Retry runtime log");
    expect(button("Export Audit")).toBeDefined();
  });
  it.each([null, { ok: true, payload: { audit: {} } }, { ok: true, payload: { audit: { manifest: { runId: "wrong" } } } }, { ok: true, payload: { audit: { manifest: { actionCount: -1 } } } }])("recovers malformed export response %#", async (result) => {
    commands.exportAudit.mockResolvedValueOnce(result);
    await mount(); await click("Export Audit");
    expect(text()).toContain("Audit export could not be prepared.");
    expect(button("Export Audit").props.disabled).toBe(false);
  });
  it("accepts empty pages and event high-water paging without a cursor", async () => {
    commands.listActions.mockResolvedValue(page([]));
    commands.listEvents.mockResolvedValue({ ok: true, payload: { events: [], page: { hasMore: true, lastSequence: 3 } } });
    await mount(); await click("Load Event Stream"); await click("Next Events");
    expect(commands.listEvents.mock.calls.at(-1)[0]).toMatchObject({ afterSequence: 3 });
    expect(text()).not.toContain("could not be loaded");
  });
  it.each(["actions", "compact", "events", "action detail", "event detail", "export"])("fences late %s completion after command ownership changes", async (kind) => {
    const pending = deferred();
    if (kind === "actions") commands.listActions.mockReturnValueOnce(pending.promise);
    if (kind === "compact") commands.loadDetail.mockReturnValueOnce(pending.promise);
    if (kind === "events") commands.listEvents.mockReturnValueOnce(pending.promise);
    if (kind === "action detail") commands.loadActionDetail.mockReturnValueOnce(pending.promise);
    if (kind === "event detail") commands.loadEventDetail.mockReturnValueOnce(pending.promise);
    if (kind === "export") commands.exportAudit.mockReturnValueOnce(pending.promise);
    await mount({ runDetail: kind === "compact" ? null : detail });
    if (kind === "events") act(() => { button("Load Event Stream").props.onClick(); });
    if (kind === "action detail") act(() => { button("Attempt a").props.onClick(); });
    if (kind === "event detail") { await click("Load Event Stream"); act(() => { const event = renderer!.root.findAllByType("button").find((node) => label(node).includes("Event one"))!; event.props.onClick(); }); }
    if (kind === "export") act(() => { button("Export Audit").props.onClick(); });
    const oldCommands = commands;
    const nextExport = deferred();
    commands = { ...commands, listActions: vi.fn(async () => page([{ attemptId: "current" }])), loadDetail: vi.fn(async () => ({ ok: true, payload: { runDetail: detail } })), exportAudit: vi.fn(() => nextExport.promise) };
    await act(async () => renderer!.update(view()));
    if (kind === "export") act(() => { button("Export Audit").props.onClick(); });
    await act(async () => pending.reject(new Error("obsolete private error")));
    expect(text()).not.toContain("could not");
    expect(text()).not.toContain("obsolete");
    expect(button("Attempt current")).toBeDefined();
    if (kind !== "export") {
      const command = kind === "actions" ? "listActions" : kind === "compact" ? "loadDetail" : kind === "events" ? "listEvents" : kind === "action detail" ? "loadActionDetail" : "loadEventDetail";
      expect(oldCommands[command].mock.calls[0][1].aborted).toBe(true);
    } else {
      expect(button("Preparing...").props.disabled).toBe(true);
      await act(async () => nextExport.resolve({ ok: false }));
      expect(button("Export Audit").props.disabled).toBe(false);
    }
  });
  it("masks prior detail and actions in the first scope-change commit", async () => {
    commands.loadDetail.mockResolvedValue({ ok: true, payload: { runDetail: { summary: { runId: "r" }, metadata: { message: "Old compact" } } } });
    const snapshots: string[] = [];
    const wrap = (options: any) => <Profiler id="log" onRender={() => { if (renderer) snapshots.push(text()); }}>{view(options)}</Profiler>;
    await act(async () => { renderer = create(wrap({ runDetail: null })); });
    expect(text()).toContain("Old compact");
    commands.listActions.mockReturnValue(new Promise(() => {}));
    commands.loadDetail.mockReturnValue(new Promise(() => {}));
    snapshots.length = 0;
    await act(async () => renderer!.update(wrap({ projectId: "other", runId: "other-run", runDetail: null })));
    expect(snapshots.length).toBeGreaterThan(0);
    for (const snapshot of snapshots) { expect(snapshot).not.toContain("Old compact"); expect(snapshot).not.toContain('"a"'); }
  });
  it("fences retained close, pager, event, view and export handlers", async () => {
    commands.listActions.mockResolvedValue(page([{ attemptId: "a", metadata: { summaryOnly: true } }], { total: 2, limit: 1, nextCursor: "next", hasMore: true }));
    await mount(); await click("Attempt a"); await click("Load Event Stream");
    const event = renderer!.root.findAllByType("button").find((node) => label(node).includes("Event one"))!;
    const callbacks = [button("Close action").props.onClick, button("Next").props.onClick, event.props.onClick, button("Export Audit").props.onClick, button("Raw action").props.onClick];
    const pending = deferred();
    const oldCommands = commands;
    commands = { ...commands, listActions: vi.fn(() => pending.promise), loadActionDetail: vi.fn(), loadEventDetail: vi.fn(), exportAudit: vi.fn() };
    await act(async () => renderer!.update(view({ projectId: "other" })));
    const signal = commands.listActions.mock.calls[0][1];
    await act(async () => { for (const callback of callbacks) callback(); });
    expect(signal.aborted).toBe(false);
    expect(oldCommands.listActions).toHaveBeenCalledTimes(1);
    expect(oldCommands.exportAudit).not.toHaveBeenCalled();
    expect(oldCommands.loadEventDetail).not.toHaveBeenCalled();
    expect(text()).not.toContain("Full action");
    await act(async () => pending.resolve(page([{ attemptId: "current" }])));
    expect(button("Attempt current")).toBeDefined();
  });
  it("guards two synchronous exports and an obsolete successful export download", async () => {
    const pending = deferred(); commands.exportAudit.mockReturnValue(pending.promise);
    const createUrl = vi.fn(); vi.stubGlobal("URL", { createObjectURL: createUrl, revokeObjectURL: vi.fn() });
    await mount(); const request = button("Export Audit").props.onClick;
    act(() => { request(); request(); });
    expect(commands.exportAudit).toHaveBeenCalledTimes(1);
    await act(async () => renderer!.update(view({ runId: "other" })));
    await act(async () => pending.resolve({ ok: true, payload: { audit: { manifest: { runId: "r", actionCount: 1 } } } }));
    expect(createUrl).not.toHaveBeenCalled();
    expect(text()).not.toContain("ready");
  });
  it("cancels pending serialization on unmount", async () => {
    let worker: any;
    const terminate = vi.fn(), revoke = vi.fn();
    vi.stubGlobal("Worker", class { onmessage: any; onerror: any; onmessageerror: any; terminate = terminate; postMessage = vi.fn(); constructor() { worker = this; } });
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:worker"), revokeObjectURL: revoke });
    commands.exportAudit.mockResolvedValue({ ok: true, payload: { audit: { manifest: {} } } });
    await mount(); await click("Export Audit");
    expect(worker).toBeDefined();
    await act(async () => { renderer!.unmount(); renderer = undefined; });
    expect(terminate).toHaveBeenCalledTimes(1); expect(revoke).toHaveBeenCalledWith("blob:worker");
  });
  it.each(["click", "schedule", "serialization"])("cleans up and offers export retry after %s failure", async (failure) => {
    vi.stubGlobal("Worker", undefined);
    const revoke = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:download"), revokeObjectURL: revoke });
    vi.stubGlobal("document", { createElement: () => ({ click: () => { if (failure === "click") throw new Error("Synthetic click"); } }) });
    vi.stubGlobal("window", { setTimeout: () => { if (failure === "schedule") throw new Error("Synthetic timer"); return 1; } });
    const audit: any = { manifest: { actionCount: 1 } }; if (failure === "serialization") audit.self = audit;
    commands.exportAudit.mockResolvedValue({ ok: true, payload: { audit } });
    await mount(); await click("Export Audit");
    expect(text()).toContain("Audit export could not be prepared.");
    expect(button("Export Audit").props.disabled).toBe(false);
    expect(revoke).toHaveBeenCalledTimes(failure === "serialization" ? 0 : 1);
  });
  it("does not display a supplied detail belonging to the preceding run", async () => {
    const pending = deferred(); commands.loadDetail.mockReturnValue(pending.promise);
    await mount({ runId: "current-run", runDetail: { summary: { runId: "r" }, metadata: { message: "Wrong supplied owner" } } });
    expect(text()).not.toContain("Wrong supplied owner");
    expect(commands.loadDetail.mock.calls[0][0]).toMatchObject({ runId: "current-run" });
    await act(async () => pending.resolve({ ok: true, payload: { runDetail: { summary: { runId: "current-run" }, metadata: { message: "Current detail" } } } }));
    expect(text()).toContain("Current detail");
  });
  it("ignores retained failed retry and scroll callbacks without aborting the current read", async () => {
    commands.listActions.mockResolvedValueOnce({ ok: false });
    commands.listEvents.mockResolvedValueOnce({ ok: false });
    await mount(); await click("Load Event Stream");
    const retry = button("Retry actions").props.onClick;
    const retryEvents = button("Retry events").props.onClick;
    const scroll = renderer!.root.findByProps({ className: "automation-runtime-event-list" }).props.onScroll;
    const oldCommands = commands, pending = deferred();
    commands = { ...commands, listActions: vi.fn(() => pending.promise), listEvents: vi.fn(async () => ({ ok: true, payload: { events: [{ sequence: 1, title: "Current visible event" }] } })) };
    await act(async () => renderer!.update(view({ projectId: "other" })));
    await click("Load Event Stream");
    await act(async () => { retry(); retryEvents(); scroll({ currentTarget: { scrollTop: 10_000 } }); });
    expect(oldCommands.listActions).toHaveBeenCalledTimes(1); expect(oldCommands.listEvents).toHaveBeenCalledTimes(1);
    expect(commands.listActions.mock.calls[0][1].aborted).toBe(false);
    expect(text()).toContain("Current visible event");
    await act(async () => pending.resolve(page([])));
  });
  it.each(["actions", "compact", "events", "action detail", "event detail", "export"])("fences successful %s completion after unmount", async (kind) => {
    const pending = deferred();
    const command = kind === "actions" ? "listActions" : kind === "compact" ? "loadDetail" : kind === "events" ? "listEvents" : kind === "action detail" ? "loadActionDetail" : kind === "event detail" ? "loadEventDetail" : "exportAudit";
    commands[command].mockReturnValueOnce(pending.promise);
    await mount({ runDetail: kind === "compact" ? null : detail });
    if (kind === "events") act(() => { button("Load Event Stream").props.onClick(); });
    if (kind === "action detail") act(() => { button("Attempt a").props.onClick(); });
    if (kind === "event detail") { await click("Load Event Stream"); act(() => { renderer!.root.findAllByType("button").find((node) => label(node).includes("Event one"))!.props.onClick(); }); }
    if (kind === "export") act(() => { button("Export Audit").props.onClick(); });
    const createUrl = vi.fn(); vi.stubGlobal("URL", { createObjectURL: createUrl, revokeObjectURL: vi.fn() });
    await act(async () => { renderer!.unmount(); renderer = undefined; });
    if (kind !== "export") expect(commands[command].mock.calls[0][1].aborted).toBe(true);
    await act(async () => pending.resolve({ ok: true, payload: { runDetail: detail, actions: [{ attemptId: "late" }], events: [{ sequence: 9 }], action: { attemptId: "a" }, event: { sequence: 1 }, audit: { manifest: {} } } }));
    expect(createUrl).not.toHaveBeenCalled();
  });
  it("downloads a current successful audit and revokes its URL after the click", async () => {
    vi.stubGlobal("Worker", undefined);
    const revoke = vi.fn(), anchor = { href: "", download: "", click: vi.fn() };
    let cleanup!: () => void;
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:download"), revokeObjectURL: revoke });
    vi.stubGlobal("document", { createElement: vi.fn(() => anchor) });
    vi.stubGlobal("window", { setTimeout: (callback: () => void) => { cleanup = callback; return 1; } });
    commands.exportAudit.mockResolvedValue({ ok: true, payload: { audit: { manifest: { runId: "r", actionCount: 3 } } } });
    await mount(); await click("Export Audit");
    expect(anchor.click).toHaveBeenCalledTimes(1); expect(anchor.download).toBe("fluxiq-run-audit-r.json");
    expect(text()).toContain("Audit export ready with 3 actions.");
    expect(revoke).not.toHaveBeenCalled(); cleanup(); expect(revoke).toHaveBeenCalledWith("blob:download");
  });
  it("fences retained callbacks during unmount commit before passive teardown", async () => {
    let retained!: () => void;
    let signal!: AbortSignal;
    let abortedAtCommit = false;
    function Harness({ show }: { show: boolean }) {
      useLayoutEffect(() => {
        if (!show) { abortedAtCommit = signal.aborted; retained(); }
      }, [show]);
      return show ? view() : <p>Closed log</p>;
    }
    const pending = deferred(); commands.listActions.mockReturnValueOnce(pending.promise);
    await act(async () => { renderer = create(<Harness show />); });
    retained = button("Export Audit").props.onClick;
    signal = commands.listActions.mock.calls[0][1];
    await act(async () => renderer!.update(<Harness show={false} />));
    expect(abortedAtCommit).toBe(true);
    expect(commands.exportAudit).not.toHaveBeenCalled();
    await act(async () => pending.resolve(page([])));
    expect(text()).toContain("Closed log");
  });
  it.each(["action payload", "action record", "event payload", "event record"])("retains summary when %s names a known wrong run", async (kind) => {
    const action = { attemptId: "a", output: "Wrong run action", ...(kind === "action record" ? { runId: "wrong" } : {}) };
    const event = { sequence: 1, title: "Wrong run event", ...(kind === "event record" ? { runId: "wrong" } : {}) };
    commands.loadActionDetail.mockResolvedValue({ ok: true, payload: { action, ...(kind === "action payload" ? { runId: "wrong" } : {}) } });
    commands.loadEventDetail.mockResolvedValue({ ok: true, payload: { event, ...(kind === "event payload" ? { runId: "wrong" } : {}) } });
    await mount();
    if (kind.startsWith("action")) {
      await click("Attempt a");
      expect(text()).toContain("Action details could not be loaded");
      expect(text()).not.toContain("Wrong run action");
    } else {
      await click("Load Event Stream");
      await act(async () => { renderer!.root.findAllByType("button").find((node) => label(node).includes("Event one"))!.props.onClick(); });
      expect(text()).toContain("Event details could not be loaded");
      expect(text()).not.toContain("Wrong run event");
    }
  });
});
