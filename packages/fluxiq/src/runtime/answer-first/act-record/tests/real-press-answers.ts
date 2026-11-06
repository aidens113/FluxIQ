// What a web domain's answers really hold at a press, copied key for key from paid runs `run-mw3itjcy-ce4429f7` (steps
// 38, 44, 46, 48, 50) and `run-mw3if5xt-a2bc72ae` (steps 34, 36), with the page's own words and the address replaced: no
// scenario's words in Core's tests. Only the words differ. A test built on a shape someone documented is what let the
// first repair of this pass while the real press named no listing, so these stay as they came, keys Core does not read
// included.
import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../llm/index.ts";

export const ORIGIN = "http://127.0.0.1:52477/shop";
const VIEW = "VIEW 1280x720 at the top · 72 elements with visible words or a control, in page order · find_on_page searches the rest";
const LIST_TITLE = 'Results for "mugs" | Potterfind Market';
const LIST_ADDRESS = `${ORIGIN}/search/?query=mugs&radius=5`;

export type Item = { title: string; path: string; price: string };
export const ITEMS: readonly Item[] = [
  { title: "Speckled mug, 300ml", path: "/shop/item/1003207682554201/", price: "£45" },
  { title: "Glazed fruit bowl with chrome rim", path: "/shop/item/1054419573499480/", price: "£60" },
  { title: "Blue milk jug, handmade, 16cm", path: "/shop/item/1055628457179429/", price: "£95" }
];
const pageTitle = (item: Item) => `${item.title} | Potterfind Market`;
const address = (item: Item) => `http://127.0.0.1:52477${item.path}`;
const pageView = (title: string, at: string) => `PAGE "${title}"\nURL ~${at}   (~ = ${ORIGIN})\n${VIEW}\n\n[banner]\nt801 link "Potterfind" ~/\n[complementary]\nt826 h1 "Market"\n`;
const envelope = (location: string, page: string): JsonObject => ({ schemaVersion: "web-llm-page.v3", trust: "untrusted-page-evidence", location, truncated: false, page });
const clock = { startedAt: 1793881854949, finishedAt: 1793881855523, sourceId: "tab:1062030918:frame:0" };

/** An answer as the gate receives it: the domain's evidence inside its execution result. */
function answered(evidence: JsonObject, effect: "observe" | "mutate", actionId: string, control?: string): AutomationStudioLlmEvidenceToolExecutionResult {
  return { kind: "llm_evidence_tool_execution", evidence, effectApplied: effect === "mutate", resultCode: effect === "observe" ? "web.inspect.succeeded" : "web.action.succeeded", draft: { actionId, effect, proposes: false, ...(control ? { control } : {}) } };
}

/** Step 38: a read of the list, its rows under `read.extracted`, with the link the model asked for. */
export function readListAnswer(items: readonly Item[] = ITEMS): AutomationStudioLlmEvidenceToolExecutionResult {
  const extracted = items.map((item) => ({ title: item.title, link: item.path, price: item.price, sponsored: null }));
  return answered({
    ...envelope(LIST_ADDRESS, pageView(LIST_TITLE, "/search/?query=mugs&radius=5")), ok: true, node: "web.output.dom-extract_list", status: "succeeded", pageChanged: true,
    read: { commandId: "8d3a59b5", actionType: "web.dom.extract_list", status: "succeeded", validation: { status: "passed", expected: "at least 0 records, each carrying title, link, price, sponsored", actual: "8 records from 1 page" }, message: "List extracted.", url: LIST_ADDRESS, title: LIST_TITLE, firstRows: extracted.slice(0, 3), restOfRows: `extracted holds all ${extracted.length} kept rows.`, extracted, ...clock },
    addable: true
  }, "observe", "web.output.dom-extract_list");
}

/** Step 66 of the same run: a read of what is saved, with no link in it, so nothing ties a press to these rows by its page. */
export function readSavedAnswer(items: readonly Item[] = ITEMS): AutomationStudioLlmEvidenceToolExecutionResult {
  const extracted = items.map((item) => ({ title: item.title, price: item.price, status: "Available" }));
  return answered({ ...envelope(`${ORIGIN}/saved/`, pageView("Saved items | Potterfind Market", "/saved/")), ok: true, node: "web.output.dom-extract_list", status: "succeeded", pageChanged: false, read: { actionType: "web.dom.extract_list", status: "succeeded", message: "List extracted.", url: `${ORIGIN}/saved/`, title: "Saved items | Potterfind Market", extracted, ...clock }, addable: true }, "observe", "web.output.dom-extract_list");
}

/** Steps 44 and 58: pressing a card on the list. `location` is the item's page, and `read` still the list it was pressed on. */
export function openCardAnswer(item: Item): AutomationStudioLlmEvidenceToolExecutionResult {
  const control = `${item.price} ${item.title} Upper Kelford`;
  return answered({
    ...envelope(address(item), pageView(pageTitle(item), item.path)), ok: true, node: "web.output.dom-click", status: "succeeded", pageChanged: true, control, controlHandle: "t622",
    read: { commandId: "25c56084", actionType: "web.dom.click", status: "succeeded", validation: { status: "passed", expected: `navigation to ${address(item)} begins, or the page answers the click in place`, actual: `navigation to ${address(item)} was initiated` }, message: "Element clicked.", url: LIST_ADDRESS, title: LIST_TITLE, ...clock, actionability: { actionable: true } },
    addable: true
  }, "mutate", "web.output.dom-click", control);
}

/** Steps 48 and 52: going to an item's page by its address. */
export function navigateAnswer(item: Item): AutomationStudioLlmEvidenceToolExecutionResult {
  return answered({
    ...envelope(address(item), pageView(pageTitle(item), item.path)), ok: true, node: "web.output.browser-navigate", status: "succeeded", pageChanged: true,
    read: { commandId: "09a2312b", actionType: "web.browser.navigate", status: "succeeded", validation: { status: "passed", expected: address(item), actual: `${address(item)}: the tab moved` }, message: "Navigation completed.", url: address(item), title: pageTitle(item), ...clock },
    addable: true
  }, "mutate", "web.output.browser-navigate");
}

/**
 * Steps 46, 50 and 60: pressing Save on an item's own page. No `actedOn`, no `actedOnItem`, no row. Since lane B
 * (run-mw44rtn1-37dee092) the web domain says the control's own card for a press in no list, `actedOnCard`: on an item's
 * own page, the heading the Save sits under, which is the item's title. That one key is added to the answer as it came.
 */
export function pressSaveAnswer(item: Item, handle: string): AutomationStudioLlmEvidenceToolExecutionResult {
  return answered({
    ...envelope(address(item), pageView(pageTitle(item), item.path)), ok: true, node: "web.output.dom-click", status: "succeeded", pageChanged: true, actedOnCard: item.title,
    toggle: { signature: { via: "attribute", attribute: "aria-pressed", to: true }, beforeSignature: { via: "attribute", attribute: "aria-pressed", to: false }, idempotentWith: "web.output.dom-check" },
    changed: [`${handle} "Saved" now pressed`, 't947 "Saved to your list" appeared'], control: "Save", controlHandle: handle,
    read: { commandId: "4a6f2a6f", actionType: "web.dom.click", status: "succeeded", validation: { status: "passed", expected: "the click lands on the target or something inside it", actual: "the point 1042,186 landed on the target" }, message: "Element clicked.", url: address(item), title: pageTitle(item), toggle: { via: "attribute", attribute: "aria-pressed", to: true }, toggleBefore: { via: "attribute", attribute: "aria-pressed", to: false }, ...clock, actionability: { actionable: true } },
    addable: true
  }, "mutate", "web.output.dom-click", "Save");
}
