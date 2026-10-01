import React from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vitest";
import { AutomationHierarchyDialog, submitAutomationHierarchyDialog } from "../AutomationHierarchyDialog";
import { createAutomationHierarchyDialogStore, type AutomationHierarchyDialogStore } from "../dialog-store";
import type { AutomationHierarchyDialogEvent, AutomationHierarchyDialogTransaction } from "../dialog-transaction";
import type { AutomationHierarchyNode } from "../contracts";

vi.mock("../../../programs/shared-ui", async (original) => {
  const actual = await original<typeof import("../../../programs/shared-ui")>();
  return { ...actual, Modal: (props: Parameters<typeof actual.Modal>[0]) => <section data-modal={props.title} data-busy={props.busy} data-escape={props.closeOnEscape} data-close={props.onClose}>{props.children}</section> };
});
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
type Result = { ok: boolean; error?: string };
type Props = React.ComponentProps<typeof AutomationHierarchyDialog>;
let renderer: ReactTestRenderer | undefined;
const node: AutomationHierarchyNode = { id: "synthetic-flow", label: "Synthetic", kind: "flow", category: "flow", parentId: null, viewId: "flow-nodes", sourceId: "synthetic", flowId: "synthetic" };
const nodes = new Map([[node.id, node]]);
function draft(name = "  Original  ") {
  const store = createAutomationHierarchyDialogStore();
  request(store, name); return store;
}
function request(store: AutomationHierarchyDialogStore, name = "Replacement") {
  store.request({ action: "create", parentId: null, category: "flow" }, nodes);
  store.dispatch({ type: "set-create-kind", createKind: "flow" }); store.dispatch({ type: "set-name", name });
}
function held() { let resolve!: (result: Result) => void; let reject!: (error: unknown) => void; return { promise: new Promise<Result>((yes, no) => { resolve = yes; reject = no; }), resolve, reject }; }
const execute = () => vi.fn<(transaction: AutomationHierarchyDialogTransaction) => Promise<Result>>(async () => ({ ok: true }));
const text = (element: ReactTestInstance): string => element.children.map((child) => typeof child === "string" ? child : text(child)).join("");
const button = (name: string) => renderer!.root.findAllByType("button").find((element) => text(element) === name)!;
const input = () => renderer!.root.findByType("input");
async function mount(store: AutomationHierarchyDialogStore, run = execute()) { await act(async () => { renderer = create(<AutomationHierarchyDialog store={store} execute={run} nodes={[node]} />); }); return run; }
async function update(props: Props) { await act(async () => renderer!.update(<AutomationHierarchyDialog {...props} />)); }
afterEach(() => { if (renderer) act(() => renderer!.unmount()); renderer = undefined; vi.restoreAllMocks(); });

it.each<AutomationHierarchyDialogEvent>([
  { type: "set-create-kind", createKind: "folder" }, { type: "set-create-step", step: "type" },
  { type: "set-flow-origin", flowOrigin: "recorded" }, { type: "set-name", name: "Changed" },
  { type: "set-parent", parentId: node.id }, { type: "set-pin", authorizationPin: "9876" },
  { type: "resume-editing" }, { type: "submit-started" }
])("keeps the issued transaction locked against $type", async (event) => {
  const store = draft(), pending = held(), run = execute(); run.mockReturnValueOnce(pending.promise);
  const submission = submitAutomationHierarchyDialog(store, run), captured = store.getSnapshot();
  store.dispatch(event); expect(store.getSnapshot()).toBe(captured);
  expect(await submitAutomationHierarchyDialog(store, run)).toMatchObject({ ok: false }); expect(run).toHaveBeenCalledTimes(1);
  pending.resolve({ ok: false, error: "Declared failure" }); await submission;
  expect(store.getSnapshot()).toMatchObject({ status: "failed", name: "  Original  ", error: "Declared failure" });
});
it.each([true, false])("does not publish issued outcome %s into a newer request", async (ok) => {
  const store = draft(), pending = held(), run = execute(); run.mockReturnValueOnce(pending.promise);
  const submission = submitAutomationHierarchyDialog(store, run); request(store); const replacement = store.getSnapshot();
  pending.resolve({ ok, error: "Old failure" }); await submission; expect(store.getSnapshot()).toBe(replacement);
});
it.each(["throw", "null", "string-ok", "missing-error", "blank-error"])("recovers %s without disclosing thrown text or claiming rollback", async (failure) => {
  const store = draft(), run = execute();
  if (failure === "throw") run.mockRejectedValueOnce(new Error("Synthetic private detail"));
  else run.mockResolvedValueOnce((failure === "null" ? null : failure === "string-ok" ? { ok: "yes" } : { ok: false, error: failure === "blank-error" ? " " : undefined }) as unknown as Result);
  const result = await submitAutomationHierarchyDialog(store, run);
  expect(result.ok).toBe(false); expect(store.getSnapshot()).toMatchObject({ status: "failed", name: "  Original  " });
  expect(store.getSnapshot()!.error).toMatch(/not confirmed/i); expect(store.getSnapshot()!.error).not.toContain("Synthetic private");
  expect(run).toHaveBeenCalledTimes(1); await submitAutomationHierarchyDialog(store, run); expect(run).toHaveBeenCalledTimes(2); expect(store.getSnapshot()).toBeNull();
});
it("captures a trimmed immutable submission without changing the retained draft", async () => {
  const store = draft(), pending = held(), run = execute(); store.dispatch({ type: "set-pin", authorizationPin: "12ab345" }); run.mockReturnValueOnce(pending.promise);
  const submission = submitAutomationHierarchyDialog(store, run), issued = run.mock.calls[0]![0];
  expect(issued).toMatchObject({ name: "Original", authorizationPin: "12345" }); expect(store.getSnapshot()).toMatchObject({ name: "  Original  " });
  store.dispatch({ type: "set-pin", authorizationPin: "9999" }); expect(issued.authorizationPin).toBe("12345");
  pending.resolve({ ok: false, error: "Meaningful refusal" }); await submission; expect(store.getSnapshot()!.error).toBe("Meaningful refusal");
});
it("validates deletion PIN and preserves its existing sanitization and single issued payload", async () => {
  const store = createAutomationHierarchyDialogStore(), run = execute(), pending = held(); store.request({ action: "delete", node }, nodes);
  expect(await submitAutomationHierarchyDialog(store, run)).toMatchObject({ ok: false }); expect(run).not.toHaveBeenCalled();
  store.dispatch({ type: "set-pin", authorizationPin: "12a34" }); run.mockReturnValueOnce(pending.promise);
  const submission = submitAutomationHierarchyDialog(store, run); store.dispatch({ type: "set-pin", authorizationPin: "9999" });
  expect(store.getSnapshot()!.authorizationPin).toBe("1234"); expect(run.mock.calls[0]![0].authorizationPin).toBe("1234"); pending.resolve({ ok: true }); await submission; expect(store.getSnapshot()).toBeNull();
});
it("does not issue after a synchronous subscriber replaces the transaction", async () => {
  const store = draft(), run = execute(); let replaced = false;
  const unsubscribe = store.subscribe(() => { if (!replaced && store.getSnapshot()?.status === "submitting") { replaced = true; request(store); } });
  await submitAutomationHierarchyDialog(store, run); unsubscribe(); expect(run).not.toHaveBeenCalled(); expect(store.getSnapshot()).toMatchObject({ status: "editing", name: "Replacement" });
});
it("freezes mounted pending fields and Modal close while retaining the draft", async () => {
  const store = draft(), pending = held(), run = execute(); run.mockReturnValueOnce(pending.promise); await mount(store, run);
  const name = input().props.onChange, close = renderer!.root.findByType("section").props["data-close"], submit = button("Create").props.onClick;
  act(() => { submit(); name({ target: { value: "Changed" } }); close(); submit(); });
  expect(run).toHaveBeenCalledTimes(1); expect(input().props.disabled).toBe(true); expect(renderer!.root.findAllByType("select").every((element) => element.props.disabled)).toBe(true);
  expect(renderer!.root.findByType("section").props).toMatchObject({ "data-busy": true, "data-escape": false }); expect(store.getSnapshot()).toMatchObject({ status: "submitting", name: "  Original  " });
  await act(async () => pending.resolve({ ok: false, error: "Try again" })); expect(input().props.disabled).toBe(false); expect(button("Create").props.disabled).toBe(false);
});
it.each(["request", "store", "store-return", "unmount"])("retires retained handlers after %s without retargeting", async (replacement) => {
  const store = draft(), other = draft("Other"), run = execute(); await mount(store, run);
  const change = input().props.onChange, submit = button("Create").props.onClick, close = renderer!.root.findByType("section").props["data-close"];
  if (replacement === "request") act(() => request(store));
  else if (replacement === "unmount") act(() => renderer!.unmount());
  else { await update({ store: other, execute: run, nodes: [node] }); if (replacement === "store-return") await update({ store, execute: run, nodes: [node] }); }
  const before = store.getSnapshot(), otherBefore = other.getSnapshot(); act(() => { change({ target: { value: "Foreign" } }); submit(); close(); });
  expect(run).not.toHaveBeenCalled(); expect(store.getSnapshot()).toBe(before); expect(other.getSnapshot()).toBe(otherBefore);
});
it("uses latest ordinary execute callback for new actions without retiring current field handlers", async () => {
  const store = draft(), first = execute(), latest = execute(); await mount(store, first); const change = input().props.onChange, submit = button("Create").props.onClick;
  await update({ store, execute: latest, nodes: [{ ...node }] }); act(() => change({ target: { value: "Current" } })); await act(async () => submit());
  expect(first).not.toHaveBeenCalled(); expect(latest).toHaveBeenCalledTimes(1); expect(latest.mock.calls[0]![0]).toMatchObject({ name: "Current" }); expect(store.getSnapshot()).toBeNull();
});
it.each(["unmount", "store", "store-return", "callback"])("settles an already issued captured store after %s", async (replacement) => {
  const store = draft(), other = draft("Other"), pending = held(), run = execute(), latest = execute(); run.mockReturnValueOnce(pending.promise); await mount(store, run);
  act(() => button("Create").props.onClick());
  if (replacement === "unmount") act(() => renderer!.unmount());
  else if (replacement === "callback") await update({ store, execute: latest, nodes: [node] });
  else { await update({ store: other, execute: latest, nodes: [node] }); if (replacement === "store-return") await update({ store, execute: latest, nodes: [node] }); }
  await act(async () => pending.resolve({ ok: false, error: "Captured failure" }));
  expect(store.getSnapshot()).toMatchObject({ status: "failed", error: "Captured failure" }); expect(other.getSnapshot()).toMatchObject({ status: "editing", name: "Other" }); expect(latest).not.toHaveBeenCalled();
});
it("releases an unchanged transaction as not submitted when UI retires before issue", async () => {
  const store = draft(), run = execute(), transactionId = store.getSnapshot()!.transactionId; let current = true;
  const unsubscribe = store.subscribe(() => { if (store.getSnapshot()?.status === "submitting") current = false; });
  await submitAutomationHierarchyDialog(store, run, { transactionId, canDispatch: () => current }); unsubscribe(); expect(run).not.toHaveBeenCalled(); expect(store.getSnapshot()).toMatchObject({ status: "failed" }); expect(store.getSnapshot()!.error).toMatch(/not submitted/i);
});
it("transitions from no dialog to an active dialog without conditional hook changes", async () => {
  const store = createAutomationHierarchyDialogStore(); await mount(store); expect(renderer!.toJSON()).toBeNull(); act(() => request(store)); expect(input().props.value).toBe("Replacement"); act(() => store.close()); expect(renderer!.toJSON()).toBeNull();
});
it("rejects a retained expected transaction without changing the current draft", async () => {
  const store = draft(), run = execute(), transactionId = store.getSnapshot()!.transactionId; request(store); const current = store.getSnapshot();
  await submitAutomationHierarchyDialog(store, run, { transactionId, canDispatch: () => true }); expect(store.getSnapshot()).toBe(current); expect(run).not.toHaveBeenCalled();
});
it("keeps mounted deletion PIN and close locked while an operation is pending", async () => {
  const store = createAutomationHierarchyDialogStore(), run = execute(), pending = held(); store.request({ action: "delete", node }, nodes); store.dispatch({ type: "set-pin", authorizationPin: "1234" }); run.mockReturnValueOnce(pending.promise); await mount(store, run);
  const pin = input().props.onChange, close = renderer!.root.findByType("section").props["data-close"]; act(() => button("Delete").props.onClick()); act(() => { pin({ target: { value: "9999" } }); close(); });
  expect(input().props.disabled).toBe(true); expect(store.getSnapshot()).toMatchObject({ status: "submitting", authorizationPin: "1234" }); await act(async () => pending.resolve({ ok: false, error: "Refused" })); expect(input().props.disabled).toBe(false); expect(store.getSnapshot()!.authorizationPin).toBe("1234");
});
it("closes the captured successful issued transaction after its UI unmounts", async () => {
  const store = draft(), run = execute(), pending = held(); run.mockReturnValueOnce(pending.promise); await mount(store, run); act(() => button("Create").props.onClick()); act(() => renderer!.unmount()); await act(async () => pending.resolve({ ok: true })); expect(store.getSnapshot()).toBeNull(); expect(run).toHaveBeenCalledTimes(1);
});
it("allows an explicit mounted retry after a declared failure with the original draft", async () => {
  const store = draft(), run = execute(); run.mockResolvedValueOnce({ ok: false, error: "Declared failure" }); await mount(store, run); await act(async () => button("Create").props.onClick()); expect(store.getSnapshot()).toMatchObject({ status: "failed", error: "Declared failure" }); expect(input().props.value).toBe("  Original  "); expect(JSON.stringify(renderer!.toJSON())).toContain("Declared failure"); expect(run).toHaveBeenCalledTimes(1); await act(async () => button("Create").props.onClick()); expect(run).toHaveBeenCalledTimes(2); expect(store.getSnapshot()).toBeNull();
});
it("keeps current dialog actions usable through StrictMode effect replay", async () => {
  const store = draft(), run = execute(); await act(async () => { renderer = create(<React.StrictMode><AutomationHierarchyDialog store={store} execute={run} nodes={[node]} /></React.StrictMode>); });
  act(() => input().props.onChange({ target: { value: "Strict current" } })); expect(store.getSnapshot()).toMatchObject({ name: "Strict current" }); await act(async () => button("Create").props.onClick()); expect(run).toHaveBeenCalledTimes(1); expect(store.getSnapshot()).toBeNull();
});
it("does not revive a destroyed instance's handlers when the same store is mounted again", async () => {
  const store = draft(), first = execute(), latest = execute(); await mount(store, first);
  const change = input().props.onChange, submit = button("Create").props.onClick, close = renderer!.root.findByType("section").props["data-close"];
  act(() => renderer!.unmount()); await mount(store, latest); const current = store.getSnapshot();
  act(() => { change({ target: { value: "Retired" } }); submit(); close(); }); expect(store.getSnapshot()).toBe(current); expect(first).not.toHaveBeenCalled(); expect(latest).not.toHaveBeenCalled();
  act(() => input().props.onChange({ target: { value: "Fresh" } })); await act(async () => button("Create").props.onClick()); expect(latest).toHaveBeenCalledTimes(1); expect(latest.mock.calls[0]![0]).toMatchObject({ name: "Fresh" });
});
