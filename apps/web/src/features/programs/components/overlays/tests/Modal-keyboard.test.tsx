import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vitest";
import { AlertDialog } from "../AlertDialog";
import { AuthorizationDialog } from "../AuthorizationDialog";
import { OperationBusyBoundary } from "../../../use-operation-lock";

vi.mock("react-dom", () => ({ createPortal: (children: unknown) => children }));
vi.mock("../../../overlay-environment", () => ({ acquireOverlayEnvironment: () => () => undefined }));
let view: ReactTestRenderer | undefined;
const doc = { body: {}, activeElement: null as unknown, visibilityState: "visible", hasFocus: () => true };
const confirm = vi.fn(); const cancel = vi.fn();
function node(tagName: string, type = "text", extra: Record<string, unknown> = {}) {
  return { tagName, type, ownerDocument: doc, isConnected: true, isContentEditable: false, form: null, disabled: false,
    matches: (selector: string) => selector === ":disabled" ? false : false,
    closest: (selector: string) => selector.includes('[role="dialog"]') ? panel : null,
    getClientRects: () => [{}], focus: () => undefined, ...extra };
}
const submit = node("BUTTON", "button", { click: () => confirm() });
const panel = { ownerDocument: doc, isConnected: true, focus: vi.fn(), contains: vi.fn(() => true), closest: vi.fn(() => null),
  getAttribute: vi.fn((_name: string): string | null => null), querySelector: () => submit, querySelectorAll: () => [submit] };
async function mount(kind: "alert" | "auth" = "auth", busy = false, ready = true, inherited = false) {
  submit.matches = () => false;
  vi.stubGlobal("document", doc); vi.stubGlobal("HTMLElement", class {}); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  await act(async () => { view = create(<OperationBusyBoundary busy={inherited}>{kind === "alert"
    ? <AlertDialog title="Delete synthetic item" description="Test" confirmLabel="Delete" danger busy={busy} onCancel={cancel} onConfirm={confirm} />
    : <AuthorizationDialog title="Authorize" description="Test" actionLabel="Authorize" busy={busy} requirements={{ password: true }} credentials={{ password: ready ? "synthetic" : "", pin: "", totp: "" }} onCancel={cancel} onAuthorize={confirm} onChange={() => undefined} />}</OperationBusyBoundary>, { createNodeMock: element => element.type === "section" ? panel : null }); });
  const button = view!.root.findAllByType("button").find(item => item.props["data-modal-submit"] !== undefined)!;
  const disabled = Boolean(button.props.disabled || inherited);
  submit.matches = selector => selector === ":disabled" ? disabled : false;
  panel.getAttribute.mockImplementation(name => name === "aria-busy" && (busy || inherited) ? "true" : null);
}
function enter(target = node("INPUT", "password"), extra: Record<string, unknown> = {}) {
  doc.activeElement = target; const preventDefault = vi.fn();
  view!.root.findByType("section").props.onKeyDown({ key: "Enter", nativeEvent: {}, target, currentTarget: panel, preventDefault, ...extra });
  return preventDefault;
}
afterEach(async () => { if (view) await act(async () => view!.unmount()); view = undefined; vi.unstubAllGlobals(); vi.clearAllMocks(); panel.contains.mockReturnValue(true); panel.closest.mockReturnValue(null); });
it.each(["Cancel", "Close"])("Alert %s Enter preserves native activation without confirmation", async label => {
  await mount("alert"); const button = view!.root.findAllByType("button").find(item => label === "Close" ? item.props["aria-label"] === "Close" : item.children.includes("Cancel"))!;
  const prevent = enter(node("BUTTON", "button")); expect(confirm).not.toHaveBeenCalled(); expect(prevent).not.toHaveBeenCalled(); button.props.onClick(); expect(cancel).toHaveBeenCalledOnce();
});
it.each(["text", "password", "search", "email", "url", "tel", "number"])("ready authorization keeps %s quick-submit", async type => {
  await mount(); const prevent = enter(node("INPUT", type)); expect(confirm).toHaveBeenCalledOnce(); expect(prevent).toHaveBeenCalledOnce();
});
it.each(["SELECT", "TEXTAREA", "A", "BUTTON", "DIV"])("%s Enter retains native behavior", async tag => {
  await mount(); expect(enter(node(tag, "text", { isContentEditable: tag === "DIV" }))).not.toHaveBeenCalled(); expect(confirm).not.toHaveBeenCalled();
});
it.each(["checkbox", "radio", "file", "hidden", "date", "range", "submit"])("input %s cannot quick-submit", async type => {
  await mount(); expect(enter(node("INPUT", type))).not.toHaveBeenCalled(); expect(confirm).not.toHaveBeenCalled();
});
it.each([{ defaultPrevented: true }, { shiftKey: true }, { metaKey: true }, { altKey: true }, { ctrlKey: true }, { nativeEvent: { isComposing: true } }, { nativeEvent: { keyCode: 229 } }])("handled/modified/composing Enter stays native: %j", async extra => {
  await mount(); expect(enter(undefined, extra)).not.toHaveBeenCalled(); expect(confirm).not.toHaveBeenCalled();
});
it.each(["busy", "inherited", "unready"])("%s authorization cannot quick-submit", async kind => {
  await mount("auth", kind === "busy", kind !== "unready", kind === "inherited"); enter(); expect(confirm).not.toHaveBeenCalled();
});
it.each(["form", "disabled", "hidden", "inert", "nested", "portal", "unfocused", "disconnected"])("refuses %s input ownership", async kind => {
  await mount(); const target = node("INPUT", "password", { form: kind === "form" ? {} : null, isConnected: kind !== "disconnected",
    matches: () => kind === "disabled", closest: (selector: string) => selector.includes('[role="dialog"]') ? kind === "nested" ? {} : panel : ["hidden", "inert"].includes(kind) ? {} : null });
  if (kind === "portal") panel.contains.mockReturnValue(false);
  const prevent = enter(target, kind === "unfocused" ? { target: node("INPUT") } : {});
  expect(confirm).not.toHaveBeenCalled(); expect(prevent).not.toHaveBeenCalled();
});
it("readonly input cannot quick-submit", async () => { await mount(); enter(node("INPUT", "text", { readOnly: true })); expect(confirm).not.toHaveBeenCalled(); });
it.each(["hidden", "unfocused"])("%s document cannot quick-submit", async kind => {
  await mount(); const target = node("INPUT", "password", { ownerDocument: { activeElement: null, visibilityState: kind === "hidden" ? "hidden" : "visible", hasFocus: () => kind !== "unfocused" } });
  (target.ownerDocument as { activeElement: unknown }).activeElement = target; enter(target); expect(confirm).not.toHaveBeenCalled();
});
