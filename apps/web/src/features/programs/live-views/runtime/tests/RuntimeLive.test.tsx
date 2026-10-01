import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RuntimeLive } from "..";
import { LiveProgramMain } from "../../../ProgramLiveViews";
import type { CurrentUser } from "../../../types";

const mocked = vi.hoisted(() => ({ current: { get: vi.fn(), post: vi.fn() } }));
const observations = vi.hoisted(() => ({ rows: [] as string[] }));
vi.mock("../../../components", async () => {
  const actual = await vi.importActual<typeof import("../../../components")>("../../../components");
  return { ...actual, KeyValue: (props: { rows: Array<[string, string]> }) => { observations.rows.push(JSON.stringify(props.rows)); return <actual.KeyValue {...props} />; } };
});
vi.mock("../../../program-api", () => ({ useProgramApi: (program: string) => { if (program !== "runtime") throw new Error("Wrong program"); return mocked.current; } }));
vi.mock("../../../ui-performance", () => ({ useUiRenderMetric: () => undefined }));
vi.mock("next/dynamic", async () => {
  const React = await import("react");
  return { default: (load: () => Promise<React.ComponentType>) => function Dynamic() {
    const [component, setComponent] = React.useState<React.ComponentType | null>(null);
    React.useEffect(() => { void load().then((loaded) => setComponent(() => loaded)); }, []);
    return component ? React.createElement(component) : null;
  } };
});
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let renderer: ReactTestRenderer | null = null;
const snapshot = (clients = 2): any => ({ runtimeId: "runtime.one", clients: Array.from({ length: clients }, (_, index) => ({ clientId: "client." + index, sessionId: "session." + index, label: "Client " + index, transport: "websocket", status: index % 2 ? "offline" : "ready", capabilities: [] })), adapters: [], transports: [], capabilities: [], runs: [], commandAttempts: [] });
const run = (id: string): any => ({ schemaVersion: "0.1", runId: id, targetKind: "flow", targetId: "flow." + id, status: "running", queuedAt: id === "b" ? 2 : 1, commandIds: [] });
const text = () => JSON.stringify(renderer!.toJSON());
const pageRange = () => renderer!.root.findByType("footer").findByType("span").children.join("");
const button = (label: string) => renderer!.root.findAllByType("button").find((node) => node.children.includes(label))!;
const named = (type: "input" | "select", label: string) => renderer!.root.findAllByType(type).find((node) => node.props["aria-label"] === label)!;
async function click(label: string) { await act(async () => { button(label).props.onClick(); }); }
async function mount() { await act(async () => { renderer = create(<RuntimeLive />); }); }
function deferred() { let resolve!: (value: any) => void; const promise = new Promise<any>((done) => { resolve = done; }); return { promise, resolve }; }
beforeEach(() => { observations.rows = []; mocked.current = { get: vi.fn().mockResolvedValue({ ok: true, payload: snapshot() }), post: vi.fn().mockImplementation(async (_endpoint, payload) => ({ ok: true, payload: run(payload.runId) })) }; });
afterEach(async () => { if (renderer) await act(async () => renderer!.unmount()); renderer = null; });

describe("Read-only Runtime workspace", () => {
  it("mounts Runtime from real program composition and makes only one initial snapshot read", async () => {
    await act(async () => { renderer = create(<LiveProgramMain programId="runtime" user={{} as CurrentUser} />); });
    expect(text()).toContain("Global runtime inventory");
    expect(mocked.current.get).toHaveBeenCalledTimes(1);
    expect(mocked.current.get.mock.calls[0]![0]).toBe("snapshot");
    expect(mocked.current.post).not.toHaveBeenCalled();
  });

  it.each([{ ok: false, status: 403, error: "synthetic-private-error" }, { ok: true, payload: {} }])("does not claim an empty healthy inventory after initial failure or malformed payload", async (response) => {
    mocked.current.get.mockResolvedValueOnce(response);
    await mount(); expect(text()).toContain("Runtime unavailable");
    expect(text()).not.toContain("synthetic-private-error");
    expect(text()).not.toContain("Global runtime inventory");
    await click("Retry Runtime"); expect(text()).toContain("Global runtime inventory");
  });

  it("labels deferred initial load and retained snapshot stale after refresh failure", async () => {
    const initial = deferred(); mocked.current.get.mockReturnValueOnce(initial.promise);
    await mount(); expect(text()).toContain("Loading Runtime");
    await act(async () => initial.resolve({ ok: true, payload: snapshot() }));
    mocked.current.get.mockResolvedValueOnce({ ok: false, error: "do not display me" });
    await click("Refresh Runtime");
    expect(text()).toContain("Client 0"); expect(text()).toContain("Displayed snapshot is stale");
    expect(text()).toContain("Snapshot loaded at"); expect(text()).not.toContain("do not display me");
  });

  it("keeps the latest refresh response and aborts an obsolete request", async () => {
    await mount(); const old = deferred(); const fresh = deferred();
    mocked.current.get.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    await click("Refresh Runtime"); await click("Refresh Runtime");
    expect(mocked.current.get.mock.calls[1]![1].signal.aborted).toBe(true);
    await act(async () => fresh.resolve({ ok: true, payload: { ...snapshot(), runtimeId: "fresh" } }));
    await act(async () => old.resolve({ ok: true, payload: { ...snapshot(), runtimeId: "obsolete" } }));
    expect(text()).toContain("fresh"); expect(text()).not.toContain("obsolete");
  });

  it("bounds mounted rows, resets pages on search and reconciles removed/filtered selection", async () => {
    mocked.current.get.mockResolvedValueOnce({ ok: true, payload: snapshot(101) });
    await mount(); expect(renderer!.root.findAllByType("tr")).toHaveLength(51);
    await click("Next Runtime page"); expect(pageRange()).toContain("51-100 of 101");
    await act(async () => named("input", "Search Runtime entries").props.onChange({ target: { value: "Client 100" } }));
    expect(pageRange()).toContain("1-1 of 1"); expect(text()).not.toContain("Client 50");
    await act(async () => named("select", "Filter Runtime entries").props.onChange({ target: { value: "offline" } }));
    expect(text()).toContain("No matching entries");
    expect(renderer!.root.findAll((node) => node.props["aria-label"] === "Selected runtime entry")).toHaveLength(0);
    await act(async () => named("select", "Filter Runtime entries").props.onChange({ target: { value: "all" } }));
    await click("Refresh Runtime"); expect(text()).toContain("No matching entries");
  });

  it("keeps multiple sessions of one client selectable and omits arbitrary payload content", async () => {
    const payload = snapshot(); payload.clients = ["one", "two"].map((sessionId) => ({ clientId: "same", sessionId, label: "Client", status: "ready", transport: "websocket", metadata: { value: "synthetic-secret" } }));
    payload.runs = [{ ...run("a"), metadata: { value: "synthetic-secret" }, traceRef: "synthetic-secret" }];
    mocked.current.get.mockResolvedValueOnce({ ok: true, payload });
    await mount();
    const clients = renderer!.root.findAllByType("button").filter((node) => node.children.includes("Client"));
    expect(clients).toHaveLength(2);
    await act(async () => clients[1]!.props.onClick()); expect(text()).toContain("two");
    expect(text()).not.toContain("synthetic-secret");
  });

  it("loads run detail lazily, rejects mismatched identity and retries without changing the selected run", async () => {
    mocked.current.get.mockResolvedValueOnce({ ok: true, payload: { ...snapshot(), runs: [run("a")] } });
    mocked.current.post.mockResolvedValueOnce({ ok: true, payload: run("other") });
    await mount(); expect(mocked.current.post).not.toHaveBeenCalled();
    await click("Runs"); expect(text()).toContain("Run detail unavailable");
    expect(text()).not.toContain("flow.other");
    await click("Retry run detail"); expect(text()).toContain("Confirmed run detail");
    expect(mocked.current.post.mock.calls.every((call) => call[0] === "get-run" && JSON.stringify(call[1]) === '{"runId":"a"}')).toBe(true);
  });

  it("drops delayed selected-run detail on selection change and filter removal", async () => {
    const old = deferred();
    mocked.current.get.mockResolvedValueOnce({ ok: true, payload: { ...snapshot(), runs: [run("a"), run("b")] } });
    mocked.current.post.mockReturnValueOnce(old.promise);
    await mount(); await click("Runs");
    const a = renderer!.root.findAllByType("button").find((node) => node.children.includes("flow.a"))!;
    await act(async () => a.props.onClick());
    await act(async () => old.resolve({ ok: true, payload: { ...run("b"), targetId: "obsolete-target" } }));
    expect(text()).not.toContain("obsolete-target"); expect(text()).toContain("Confirmed run detail");
    await act(async () => named("input", "Search Runtime entries").props.onChange({ target: { value: "not-present" } }));
    expect(renderer!.root.findAll((node) => node.props["aria-label"] === "Runtime run detail")).toHaveLength(0);
  });

  it("drops deferred snapshot/detail completions and stale callbacks after unmount", async () => {
    const pending = deferred(); await mount();
    mocked.current.get.mockReturnValueOnce(pending.promise);
    const refresh = button("Refresh Runtime").props.onClick;
    await act(async () => refresh()); await act(async () => renderer!.unmount());
    const calls = mocked.current.get.mock.calls.length;
    await act(async () => { refresh(); pending.resolve({ ok: true, payload: snapshot() }); });
    expect(mocked.current.get).toHaveBeenCalledTimes(calls);
    expect(renderer!.toJSON()).toBeNull();
  });

  it("does not publish old scope results when Program API identity changes", async () => {
    const pending = deferred(); await mount();
    const oldApi = mocked.current; oldApi.get.mockReturnValueOnce(pending.promise);
    await click("Refresh Runtime");
    mocked.current = { get: vi.fn().mockResolvedValue({ ok: true, payload: { ...snapshot(), runtimeId: "new-scope" } }), post: vi.fn() };
    await act(async () => renderer!.update(<RuntimeLive />));
    await act(async () => pending.resolve({ ok: true, payload: { ...snapshot(), runtimeId: "old-scope" } }));
    expect(text()).toContain("new-scope"); expect(text()).not.toContain("old-scope");
  });

  it("does not read an old selected run in a new Program API scope", async () => {
    mocked.current.get.mockResolvedValueOnce({ ok: true, payload: { ...snapshot(), runs: [run("a")] } });
    await mount(); await click("Runs");
    mocked.current = { get: vi.fn().mockResolvedValue({ ok: true, payload: snapshot() }), post: vi.fn() };
    await act(async () => renderer!.update(<RuntimeLive />));
    expect(mocked.current.post).not.toHaveBeenCalled();
    expect(text()).not.toContain("flow.a");
  });

  it("keeps detail failures safe, retries, and shows recorded dispatch without arbitrary result data", async () => {
    const payload = snapshot(); payload.runs = [run("a")];
    payload.commandAttempts = [{ attemptId: "attempt.one", commandId: "command.one", runId: "a", command: { kind: "execute_action", parameters: { text: "synthetic-private-value" } }, status: "failed", dispatchedAt: 1, clientId: "actual-client", transport: "websocket", result: { error: "synthetic-private-value", payload: { text: "synthetic-private-value" } } }];
    mocked.current.get.mockResolvedValueOnce({ ok: true, payload });
    mocked.current.post.mockResolvedValueOnce({ ok: false, status: 403, error: "synthetic-private-value" });
    await mount(); await click("Runs");
    expect(text()).toContain("snapshot summary may be stale");
    expect(text()).toContain("actual-client"); expect(text()).not.toContain("synthetic-private-value");
    await click("Retry run detail"); expect(text()).toContain("Confirmed run detail");
    await click("Dispatch"); expect(text()).toContain("attempt.one");
    expect(text()).toContain("actual-client"); expect(text()).not.toContain("synthetic-private-value");
  });

  it("ignores delayed failed detail and captured retry after unmount", async () => {
    const pending = deferred();
    mocked.current.get.mockResolvedValueOnce({ ok: true, payload: { ...snapshot(), runs: [run("a")] } });
    mocked.current.post.mockResolvedValueOnce({ ok: false });
    await mount(); await click("Runs");
    const retry = button("Retry run detail").props.onClick;
    mocked.current.post.mockReturnValueOnce(pending.promise);
    await act(async () => retry()); await act(async () => renderer!.unmount());
    const calls = mocked.current.post.mock.calls.length;
    await act(async () => { retry(); pending.resolve({ ok: false, error: "late-private-error" }); });
    expect(mocked.current.post).toHaveBeenCalledTimes(calls);
    expect(mocked.current.post.mock.calls.at(-1)![2].signal.aborted).toBe(true);
    expect(renderer!.toJSON()).toBeNull();
  });

  it("masks a previously confirmed same-run detail before passive effects on successful snapshot refresh", async () => {
    mocked.current.get.mockResolvedValueOnce({ ok: true, payload: { ...snapshot(), runs: [run("a")] } });
    mocked.current.post.mockResolvedValueOnce({ ok: true, payload: { ...run("a"), selectedClientId: "old-confirmed" } });
    await mount(); await click("Runs"); expect(text()).toContain("old-confirmed");
    const refresh = deferred(), detail = deferred();
    mocked.current.get.mockReturnValueOnce(refresh.promise); mocked.current.post.mockReturnValueOnce(detail.promise);
    await click("Refresh Runtime"); observations.rows = [];
    await act(async () => refresh.resolve({ ok: true, payload: { ...snapshot(), runs: [{ ...run("a"), selectedClientId: "new-summary" }] } }));
    expect(observations.rows.some((value) => value.includes("old-confirmed"))).toBe(false);
    expect(observations.rows[0]).toContain("new-summary");
    expect(text()).toContain("Snapshot run summary"); expect(text()).not.toContain("Confirmed run detail");
    await act(async () => detail.resolve({ ok: true, payload: { ...run("a"), selectedClientId: "new-confirmed" } }));
    expect(text()).toContain("Confirmed run detail"); expect(text()).toContain("new-confirmed");
  });
});
