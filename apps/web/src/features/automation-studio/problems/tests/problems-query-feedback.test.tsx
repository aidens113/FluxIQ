import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProblemsView } from "../ProblemsView";
import type { ProblemsViewHostProps } from "../problem-host";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
type Result = Awaited<ReturnType<NonNullable<ProblemsViewHostProps["onListProblems"]>>>;
let view: ReactTestRenderer;
const list = vi.fn<NonNullable<ProblemsViewHostProps["onListProblems"]>>();
const base = (): ProblemsViewHostProps => ({ projectId: "project.one", currentObjectId: "node.one", problems: [], onListProblems: list });
const text = () => JSON.stringify(view.toJSON());
const button = (label: string) => view.root.findAllByType("button").find((node) => node.children.some((child) => typeof child === "string" && child.includes(label)))!;
const success = (label?: string): Result => ({ ok: true, payload: { problems: label ? [{ id: label, label, message: label, severity: "error" }] : [], page: { total: label ? 1 : 0, counts: { error: label ? 1 : 0 } } } });
function deferred() {
  let resolve!: (value: Result) => void;
  const promise = new Promise<Result>((done) => { resolve = done; });
  return { promise, resolve };
}
async function mount(props = base()) { await act(async () => { view = create(<ProblemsView {...props} />); }); }
async function tick() { await act(async () => { await vi.advanceTimersByTimeAsync(180); }); }
async function search(value: string) { await act(async () => { view.root.findByType("input").props.onChange({ target: { value } }); }); }

beforeEach(() => { vi.useFakeTimers(); list.mockReset(); });
afterEach(async () => { if (view) await act(async () => view.unmount()); vi.useRealTimers(); });

describe("Problems remote query feedback", () => {
  it("does not claim clean validation before the initial query completes", async () => {
    const request = deferred(); list.mockReturnValue(request.promise);
    await mount();
    expect(text()).not.toContain("pass available checks");
    expect(view.root.findByType("section").props["aria-busy"]).toBe(true);
    await tick();
    await act(async () => request.resolve(success()));
    expect(text()).toContain("No problems found");
    expect(view.root.findByType("section").props["aria-busy"]).toBe(false);
  });

  it("shows initial failure and retry success without reporting a clean project", async () => {
    list.mockResolvedValueOnce({ ok: false, error: "offline" }).mockResolvedValueOnce(success());
    await mount(); await tick();
    expect(text()).toContain("Could not load problems");
    expect(text()).not.toContain("pass available checks");
    await act(async () => button("Retry").props.onClick());
    expect(text()).toContain("No problems found");
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("retains failed filtered results with a stale label and retries the current filter", async () => {
    list.mockResolvedValueOnce(success("Previous issue")).mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce(success("New issue"));
    await mount(); await tick(); await search("new");
    expect(text()).toContain("previous query");
    await tick();
    expect(text()).toContain("Previous issue");
    expect(text()).toContain("previous query");
    await act(async () => button("Retry").props.onClick());
    expect(list.mock.calls.at(-1)![0]).toMatchObject({ search: "new" });
    expect(text()).toContain("New issue");
    expect(text()).not.toContain("Previous issue");
    expect(text()).not.toContain("previous query");
  });

  it("shows denied permission and can retry after permission is restored", async () => {
    list.mockResolvedValueOnce({ ok: false, error: "Denied", status: 403 } as Result).mockResolvedValueOnce(success());
    await mount(); await tick();
    expect(text()).toContain("permission");
    expect(text()).not.toContain("pass available checks");
    await act(async () => button("Retry").props.onClick());
    expect(text()).toContain("No problems found");
  });

  it("catches rejected requests and offers retry", async () => {
    list.mockRejectedValueOnce(new Error("synthetic connection failure")).mockResolvedValueOnce(success());
    await mount(); await tick();
    expect(text()).toContain("Could not load problems");
    await act(async () => button("Retry").props.onClick());
    expect(text()).toContain("No problems found");
  });

  it("discards old completion during the filter debounce interval", async () => {
    const old = deferred(); list.mockReturnValueOnce(old.promise).mockResolvedValueOnce(success("Current issue"));
    await mount(); await tick(); await search("current");
    await act(async () => old.resolve(success("Obsolete issue")));
    expect(text()).not.toContain("Obsolete issue");
    await tick(); expect(text()).toContain("Current issue");
  });

  it("discards delayed old scope/project replies and hides other-project retained rows", async () => {
    const old = deferred(); list.mockResolvedValueOnce(success("Project one issue")).mockReturnValueOnce(old.promise).mockResolvedValueOnce(success("Project two issue"));
    await mount(); await tick();
    await act(async () => button("Current object").props.onClick()); await tick();
    expect(list.mock.calls.at(-1)![0]).toMatchObject({ scopeId: "node.one" });
    await act(async () => view.update(<ProblemsView {...base()} projectId="project.two" currentObjectId="node.two" />));
    expect(text()).not.toContain("Project one issue");
    await act(async () => old.resolve(success("Old scope issue")));
    expect(text()).not.toContain("Old scope issue");
    await tick(); expect(text()).toContain("Project two issue");
    expect(list.mock.calls.at(-1)![0]).toMatchObject({ projectId: "project.two", scopeId: "node.two" });
  });

  it("does not publish a delayed request after unmount", async () => {
    const old = deferred(); list.mockReturnValue(old.promise);
    await mount(); await tick();
    await act(async () => view.unmount());
    await act(async () => old.resolve(success("Late issue")));
    expect(view.toJSON()).toBeNull();
  });

  it("retries the failed next-page cursor rather than silently reloading the previous page", async () => {
    const first = success("First page");
    first.payload!.page = { total: 101, counts: { error: 101 }, nextCursor: "cursor.next", hasMore: true };
    list.mockResolvedValueOnce(first).mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce(success("Second page"));
    await mount(); await tick();
    await act(async () => button("Next").props.onClick());
    expect(text()).toContain("previous query");
    expect(button("Next").props.disabled).toBe(true);
    await act(async () => button("Retry").props.onClick());
    expect(list.mock.calls.at(-1)![0]).toMatchObject({ cursor: "cursor.next" });
    expect(text()).toContain("Second page");
    expect(text()).not.toContain("First page");
  });

  it.each([undefined, () => Promise.resolve({ ok: true })])("shows failure rather than a clean project when the query provider/response is missing", async (onListProblems) => {
    const props = base();
    delete props.onListProblems;
    await mount({ ...props, ...(onListProblems ? { onListProblems } : {}) }); await tick();
    expect(text()).toContain("Could not load problems");
    expect(text()).not.toContain("No problems found");
    expect(text()).not.toContain("pass available checks");
  });
});
