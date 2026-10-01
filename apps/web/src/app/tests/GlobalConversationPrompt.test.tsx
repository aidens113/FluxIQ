import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GlobalConversationPrompt } from "../GlobalConversationPrompt";

const route = vi.hoisted(() => ({ pathname: "/programs/compute-control" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
vi.mock("../../features/programs/shared-ui", () => ({
  Modal: ({ children, title }: any) => <section aria-label={title}>{children}</section>,
  InlineNotice: ({ message }: any) => <p>{message}</p>,
  Button: ({ children, busy, ...props }: any) => <button {...props} disabled={props.disabled || busy}>{children}</button>
}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let renderer: ReactTestRenderer | null = null;
const fetchMock = vi.fn();
const conversations = (ids: string[]) => ids.map((id, index) => ({ conversationId: id, projectId: "project." + id, subject: { kind: "project", id: "project." + id }, status: "open", pendingAskCount: 1, createdAt: 1, updatedAt: 100 - index }));
const turn = (id: string, ask = true) => ({ turnId: "turn." + id, conversationId: id, author: "automation", createdAt: 1, text: "Question " + id, ...(ask ? { ask: { askId: "ask." + id, kind: "choice", status: "pending", parks: true, options: [{ id: "yes", label: "Continue" }] } } : {}) });
const response = (payload: unknown, status = 200) => new Response(JSON.stringify({ ok: status === 200, payload }), { status });
const detail = (id: string, ask = true, hasMore = false) => response({ conversation: { turns: [turn(id, ask)], hasMore } });
const body = (call: any[] | undefined) => { expect(call).toBeDefined(); return JSON.parse(call![1].body); };
const text = () => JSON.stringify(renderer!.toJSON());
const click = async (label: string) => { await act(async () => renderer!.root.findAllByType("button").find((button) => button.children.includes(label))!.props.onClick()); };
async function flush() { for (let index = 0; index < 30; index++) await Promise.resolve(); }
async function mount() { await act(async () => { renderer = create(<GlobalConversationPrompt />); await flush(); }); }
async function poll() { await act(async () => { await vi.advanceTimersByTimeAsync(2000); await flush(); }); }
function deferred() { let resolve!: (response: Response) => void; const promise = new Promise<Response>((done) => { resolve = done; }); return { promise, resolve }; }

beforeEach(() => {
  vi.useFakeTimers(); route.pathname = "/programs/compute-control";
  fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("window", { setTimeout, clearTimeout });
  vi.stubGlobal("document", Object.assign(new EventTarget(), { visibilityState: "visible" }));
});
afterEach(async () => { if (renderer) await act(async () => renderer!.unmount()); renderer = null; vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("global conversation question queue", () => {
  it("finds an older waiting ask when the newest candidate is idle", async () => {
    fetchMock.mockResolvedValueOnce(response({ conversations: conversations(["new", "old"]) })).mockResolvedValueOnce(detail("new", false)).mockResolvedValueOnce(detail("old"));
    await mount();
    expect(text()).toContain("Question old");
    expect(body(fetchMock.mock.calls[2])).toMatchObject({ projectId: "project.old", conversationId: "old", limit: 100 });
  });

  it("advances past locally dismissed candidates immediately", async () => {
    fetchMock.mockImplementation(async (url: string, request: any) => url.endsWith("list-conversations") ? response({ conversations: conversations(["one", "two"]) }) : detail(JSON.parse(request.body).conversationId));
    await mount(); expect(text()).toContain("Question one");
    await click("Not now");
    expect(text()).toContain("Question two");
    expect(text()).not.toContain("Question one");
  });

  it("advances on successful answer even if a stale server snapshot still reports its old ask", async () => {
    fetchMock.mockImplementation(async (url: string, request: any) => url.endsWith("list-conversations") ? response({ conversations: conversations(["one", "two"]) }) : url.endsWith("answer-ask") ? response({}) : detail(JSON.parse(request.body).conversationId));
    await mount(); await click("Continue");
    expect(text()).toContain("Question two");
    expect(fetchMock.mock.calls.filter((call) => call[0].endsWith("answer-ask"))).toHaveLength(1);
  });

  it("finds a waiting ask on a bounded later turn page", async () => {
    fetchMock.mockResolvedValueOnce(response({ conversations: conversations(["paged"]) })).mockResolvedValueOnce(detail("paged", false, true)).mockResolvedValueOnce(detail("paged"));
    await mount();
    expect(text()).toContain("Question paged");
    expect(body(fetchMock.mock.calls[2])).toMatchObject({ sinceTurnId: "turn.paged", limit: 100 });
  });

  it("continues past an unreadable candidate without masking a readable older question", async () => {
    fetchMock.mockResolvedValueOnce(response({ conversations: conversations(["denied", "old"]) })).mockResolvedValueOnce(response({}, 403)).mockResolvedValueOnce(detail("old"));
    await mount(); expect(text()).toContain("Question old");
  });

  it("shows a safe failed-read notice and retries after permission is restored", async () => {
    fetchMock.mockResolvedValueOnce(response({ secret: "synthetic-private-value" }, 403)).mockResolvedValueOnce(response({ conversations: conversations(["one"]) })).mockResolvedValueOnce(detail("one"));
    await mount(); expect(text()).toContain("could not be checked");
    expect(text()).not.toContain("synthetic-private-value");
    await click("Retry"); expect(text()).toContain("Question one");
  });

  it("keeps a refused answer pending and allows one successful retry", async () => {
    let attempts = 0;
    fetchMock.mockImplementation(async (url: string) => url.endsWith("list-conversations") ? response({ conversations: conversations(["one"]) }) : url.endsWith("answer-ask") ? response({}, ++attempts === 1 ? 403 : 200) : detail("one"));
    await mount(); await click("Continue");
    expect(text()).toContain("question is still waiting");
    expect(text()).toContain("Question one");
    await click("Continue"); expect(attempts).toBe(2);
  });

  it("does not publish a read that finishes after entering Studio or unmounting", async () => {
    const pending = deferred();
    fetchMock.mockResolvedValueOnce(response({ conversations: conversations(["one"]) })).mockReturnValueOnce(pending.promise);
    await mount();
    route.pathname = "/programs/automation-studio";
    await act(async () => renderer!.update(<GlobalConversationPrompt />));
    await act(async () => { pending.resolve(detail("one")); await flush(); });
    route.pathname = "/programs/compute-control";
    fetchMock.mockResolvedValue(response({ conversations: [] }));
    await act(async () => { renderer!.update(<GlobalConversationPrompt />); await flush(); });
    expect(text()).not.toContain("Question one");
    await act(async () => renderer!.unmount());
    await poll(); expect(renderer!.toJSON()).toBeNull();
  });

  it("continues beyond the three-page cap on the next poll instead of restarting history", async () => {
    fetchMock.mockImplementation(async (url: string, request: any) => {
      if (url.endsWith("list-conversations")) return response({ conversations: conversations(["long"]) });
      const payload = JSON.parse(request.body);
      const offset = payload.sinceTurnId ? Number(payload.sinceTurnId.split(".").at(-1)) : 0;
      const turns = offset < 300 ? Array.from({ length: 100 }, (_, index) => ({ ...turn("long", false), turnId: "turn.long." + (offset + index + 1) })) : [{ ...turn("long"), turnId: "turn.long.301" }];
      return response({ conversation: { turns, hasMore: offset < 300 } });
    });
    await mount();
    expect(fetchMock.mock.calls.filter((call) => call[0].endsWith("get-conversation"))).toHaveLength(3);
    expect(text()).toContain("bounded pages");
    await poll();
    expect(text()).toContain("Question long");
    expect(fetchMock.mock.calls.filter((call) => call[0].endsWith("get-conversation")).map(body)).toContainEqual(expect.objectContaining({ sinceTurnId: "turn.long.300" }));
  });

  it("resets a carried turn cursor when its summary revision changes even within the same timestamp", async () => {
    let revision = 1;
    fetchMock.mockImplementation(async (url: string, request: any) => {
      if (url.endsWith("list-conversations")) return response({ conversations: conversations(["changed"]).map((entry) => ({ ...entry, revision })) });
      const payload = JSON.parse(request.body);
      if (revision === 2) return detail("changed");
      const page = payload.sinceTurnId ? Number(payload.sinceTurnId.split(".").at(-1)) + 1 : 1;
      return response({ conversation: { turns: [{ ...turn("changed", false), turnId: "turn.changed." + page }], hasMore: true } });
    });
    await mount(); revision = 2;
    await poll();
    expect(text()).toContain("Question changed");
    expect(body(fetchMock.mock.calls.filter((call) => call[0].endsWith("get-conversation")).at(-1)!)).not.toHaveProperty("sinceTurnId");
  });

  it("bounds scans and rotates candidates so later summaries are eventually checked", async () => {
    const ids = Array.from({ length: 30 }, (_, index) => "candidate." + index);
    fetchMock.mockImplementation(async (url: string, request: any) => url.endsWith("list-conversations") ? response({ conversations: conversations(ids) }) : detail(JSON.parse(request.body).conversationId, JSON.parse(request.body).conversationId === "candidate.20"));
    await mount();
    expect(body(fetchMock.mock.calls[0])).toMatchObject({ limit: 25 });
    expect(fetchMock.mock.calls.filter((call) => call[0].endsWith("get-conversation"))).toHaveLength(12);
    expect(text()).toContain("More conversations");
    await poll(); expect(text()).toContain("Question candidate.20");
    expect(fetchMock.mock.calls.filter((call) => call[0].endsWith("get-conversation")).length).toBeLessThanOrEqual(24);
  });

  it("guards duplicate answers and ignores late mutation completion after leaving the prompt", async () => {
    const answer = deferred();
    fetchMock.mockImplementation(async (url: string) => url.endsWith("list-conversations") ? response({ conversations: conversations(["one"]) }) : url.endsWith("answer-ask") ? answer.promise : detail("one"));
    await mount();
    const action = renderer!.root.findAllByType("button").find((button) => button.children.includes("Continue"))!.props.onClick;
    await act(async () => { action(); action(); });
    expect(fetchMock.mock.calls.filter((call) => call[0].endsWith("answer-ask"))).toHaveLength(1);
    route.pathname = "/programs/automation-studio";
    await act(async () => renderer!.update(<GlobalConversationPrompt />));
    await act(async () => { answer.resolve(response({}, 403)); await flush(); });
    expect(renderer!.toJSON()).toBeNull();
  });

  it("dismissal exposes an older pending ask within the same conversation page", async () => {
    fetchMock.mockImplementation(async (url: string) => url.endsWith("list-conversations") ? response({ conversations: conversations(["one"]) }) : response({ conversation: { turns: [turn("older"), turn("newer")].map((entry) => ({ ...entry, conversationId: "one" })), hasMore: false } }));
    await mount(); expect(text()).toContain("Question newer");
    await click("Not now"); expect(text()).toContain("Question older");
  });

  it("ignores an in-flight refresh after dismissal and advances on the next scan", async () => {
    const stale = deferred(); let reads = 0;
    fetchMock.mockImplementation(async (url: string, request: any) => {
      if (url.endsWith("list-conversations")) return response({ conversations: conversations(["one", "two"]) });
      if (++reads === 2) return stale.promise;
      return detail(JSON.parse(request.body).conversationId);
    });
    await mount();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    await click("Not now");
    await act(async () => { stale.resolve(detail("one")); await flush(); });
    expect(text()).not.toContain("Question one");
    await poll(); expect(text()).toContain("Question two");
  });

  it("settles a delayed detail after unmount without starting another scan", async () => {
    const late = deferred();
    fetchMock.mockResolvedValueOnce(response({ conversations: conversations(["one"]) })).mockReturnValueOnce(late.promise);
    await mount(); await act(async () => renderer!.unmount());
    await act(async () => { late.resolve(detail("one")); await flush(); });
    await poll();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(renderer!.toJSON()).toBeNull();
  });

  it("ignores captured dismiss and answer handlers after a newer question is published", async () => {
    let id = "one";
    fetchMock.mockImplementation(async (url: string) => url.endsWith("list-conversations") ? response({ conversations: conversations([id]) }) : detail(id));
    await mount();
    const oldDismiss = renderer!.root.findAllByType("button").find((button) => button.children.includes("Not now"))!.props.onClick;
    const oldAnswer = renderer!.root.findAllByType("button").find((button) => button.children.includes("Continue"))!.props.onClick;
    id = "two"; await poll();
    expect(text()).toContain("Question two");
    const requestCount = fetchMock.mock.calls.length;
    await act(async () => { oldDismiss(); oldAnswer(); await flush(); });
    expect(fetchMock).toHaveBeenCalledTimes(requestCount);
    expect(fetchMock.mock.calls.filter((call) => call[0].endsWith("answer-ask"))).toHaveLength(0);
    expect(text()).toContain("Question two");
  });
});
