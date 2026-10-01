import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vitest";
import { ModalContent } from "../ModalContent";
import { AuthorizationDialog } from "../AuthorizationDialog";

const acquire = vi.hoisted(() => vi.fn(() => () => undefined));
vi.mock("react-dom", () => ({ createPortal: (children: unknown) => children }));
vi.mock("../../../overlay-environment", () => ({ acquireOverlayEnvironment: acquire }));
let view: ReactTestRenderer | undefined;
function candidate(tagName: string, attributes: string[] = [], invalid = "") {
  return { tagName, ownerDocument: { defaultView: { getComputedStyle: () => ({ visibility: invalid === "css-hidden" ? "hidden" : "visible" }) } }, isConnected: invalid !== "disconnected", type: invalid === "hidden-input" ? "hidden" : "text", tabIndex: 0,
    matches: (selector: string) => selector === ":disabled" && ["disabled", "fieldset"].includes(invalid),
    closest: () => ["hidden", "inert", "aria-hidden"].includes(invalid) ? {} : null,
    getClientRects: () => invalid === "zero-size" ? [] : [{}], focus: vi.fn(), hasAttribute: (name: string) => attributes.includes(name) };
}
async function mount(invalid = "", auth = false) {
  const close = candidate("BUTTON", [], invalid === "all-disabled" ? "disabled" : ""); const explicit = candidate("INPUT", ["data-autofocus"], ["all-disabled", "button-fallback", "native-fallback"].includes(invalid) ? "disabled" : invalid); const ordinary = candidate("INPUT", ["both-autofocus", "native-fallback"].includes(invalid) ? ["autofocus"] : [], ["all-disabled", "button-fallback"].includes(invalid) ? "disabled" : "");
  const doc = { activeElement: null, body: {} }; const content = { querySelectorAll: (selector: string) => selector.includes("input") ? [explicit, ordinary] : [close] };
  const all = [close, explicit, ordinary];
  const panel = { ownerDocument: doc, focus: vi.fn(), closest: () => null,
    querySelector: (selector: string) => selector === ".modal-operation-boundary" ? content : all.find(item => selector.includes("data-autofocus") || selector.includes("button") ? true : item.tagName === "INPUT"),
    querySelectorAll: (selector: string) => selector === "[data-autofocus]" ? [explicit] : selector === "[autofocus]" ? ordinary.hasAttribute("autofocus") ? [ordinary] : [] : selector.includes("input") ? [explicit, ordinary] : [close] };
  vi.stubGlobal("document", { body: {}, activeElement: { focus: vi.fn() } }); vi.stubGlobal("HTMLElement", class {}); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  await act(async () => { view = create(auth ? <AuthorizationDialog title="Auth" description="Test" actionLabel="Authorize" requirements={{ password: true }} credentials={{ password: "synthetic", pin: "", totp: "" }} onCancel={() => undefined} onAuthorize={() => undefined} onChange={() => undefined} /> : <ModalContent title="Test" onClose={() => undefined}><input data-autofocus /><input /></ModalContent>, { createNodeMock: element => element.type === "section" ? panel : null }); });
  return { close, explicit, ordinary, panel, doc };
}
afterEach(async () => { if (view) await act(async () => view!.unmount()); view = undefined; vi.unstubAllGlobals(); vi.clearAllMocks(); });
it("actual authorization focuses explicit password before heading Close", async () => { const state = await mount("", true); expect(state.explicit.focus).toHaveBeenCalledOnce(); expect(state.close.focus).not.toHaveBeenCalled(); });
it.each(["disabled", "fieldset", "hidden", "inert", "aria-hidden", "hidden-input", "zero-size", "disconnected", "css-hidden"])("skips %s explicit candidate for ordinary content input", async invalid => { const state = await mount(invalid); expect(state.explicit.focus).not.toHaveBeenCalled(); expect(state.ordinary.focus).toHaveBeenCalledOnce(); });
it("acquires environment from panel's owner document", async () => { const state = await mount(); expect(acquire).toHaveBeenCalledWith(state.doc, expect.objectContaining({ panel: state.panel, trapFocus: true })); });
it("all disabled controls fall back to panel", async () => { const state = await mount("all-disabled"); expect(state.panel.focus).toHaveBeenCalledOnce(); expect(state.close.focus).not.toHaveBeenCalled(); });
it("no eligible content input falls back to button", async () => { const state = await mount("button-fallback"); expect(state.close.focus).toHaveBeenCalledOnce(); });
it("data-autofocus has priority over native autofocus", async () => { const state = await mount("both-autofocus"); expect(state.explicit.focus).toHaveBeenCalledOnce(); expect(state.ordinary.focus).not.toHaveBeenCalled(); });
it("invalid data-autofocus permits native autofocus fallback", async () => { const state = await mount("native-fallback"); expect(state.explicit.focus).not.toHaveBeenCalled(); expect(state.ordinary.focus).toHaveBeenCalledOnce(); });
