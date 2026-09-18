import type { AutomationNodeParameter, AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";

// The web-automation domain's eighteen output node definitions, as that
// domain registers them on 2026-09-16, reduced to the fields a Flow Bootstrap
// catalog and a registry resolution read. Core never imports the domain, so
// this is a copy; it exists because the domain's real definitions are what
// squeezed the required `end` node out of a bounded catalog, and a synthetic
// definition did not. Each action carries the domain's `expectedState`
// parameter, whose description the catalog sends. The list extraction's
// `recordOutput` carries the `record-output` control, and its definition the
// records path, as the domain declares both.
//
// Resolve them with runtime capability `web.actions` and permission
// `web-automation.action`.

const text = (id: string, label: string, extra: Partial<AutomationNodeParameter> = {}): AutomationNodeParameter => ({ id, label, valueType: "string", allowStateBinding: true, ...extra });
const value = (id: string, label: string, extra: Partial<AutomationNodeParameter> = {}): AutomationNodeParameter => ({ id, label, valueType: "object", allowStateBinding: true, ...extra });
const flag = (id: string, label: string, defaultValue: boolean): AutomationNodeParameter => ({ id, label, valueType: "boolean", defaultValue, allowStateBinding: true });
const number = (id: string, label: string, defaultValue: number): AutomationNodeParameter => ({ id, label, valueType: "number", defaultValue, allowStateBinding: true });

const expectedState = value("expectedState", "Expected State", {
  description: "Post-conditions checked after this action, as web.dom.assert conditions: { conditions: [{ kind, selector, expected }], mode, timeoutMs }."
});
const timeoutMs = number("timeoutMs", "Timeout", 10_000);
const elementTarget = (selectorRequired: boolean): AutomationNodeParameter[] => [
  value("target", "Adapted Target"),
  text("selector", "Selector", selectorRequired ? { required: true } : {}),
  value("element", "Element"),
  value("visualTarget", "Visual Target"),
  timeoutMs
];

const extractList: AutomationNodeParameter[] = [
  value("extractList", "List", {
    required: true,
    description: "{ item, fields, paginate?, minItems?, maxItems? }. item: CSS selector of each record. fields: { key: \"css\" (text) | \"css@attr\" | \"column:Header\" (table cell) | { kind: text|attribute|link|value|column, selector?, attribute?, header?, required?: false } }; keys use A-Za-z0-9_-; field selectors are read inside each item. paginate: { mode: \"next\", next: css, maxPages } | { mode: \"loadMore\", control: css, maxPages } | { mode: \"scroll\", maxScrolls } | { mode: \"numbered\", pages: css, maxPages }, at most 50. minItems: default 1; 0 allows an empty list. maxItems: at most 1000.",
    example: { item: "li.product", fields: { name: ".name", price: ".price", url: "a@href" }, paginate: { mode: "next", next: "a.next", maxPages: 5 }, minItems: 1 }
  }),
  { ...timeoutMs, description: "Milliseconds for the whole read. Left at the default, it grows with the pages the list may read." },
  { id: "recordOutput", label: "Save extracted records", valueType: "json", defaultValue: null, allowStateBinding: false, description: "The dataset the rows are saved into. Leave empty to save every field of the list under a dataset named after its fields.", ui: { control: "record-output" } }
];

/** Where the list extraction's result keeps its rows (the domain's `WEB_AUTOMATION_EXTRACT_LIST_RECORDS_PATH`). */
const EXTRACT_LIST_RECORDS_PATH = "result.extracted";

type WebOutput = {
  slug: string;
  outputId: string;
  label: string;
  description: string;
  privileged: boolean;
  parameters: AutomationNodeParameter[];
  tags?: string[];
  records?: true;
};

const WEB_OUTPUTS: WebOutput[] = [
  { slug: "browser-navigate", outputId: "web.browser.navigate", label: "Navigate", description: "Navigate a browser tab to a URL.", privileged: true, parameters: [text("url", "URL", { required: true }), flag("newTab", "New Tab", false)] },
  { slug: "dom-click", outputId: "web.dom.click", label: "Click", description: "Click a DOM element.", privileged: true, parameters: elementTarget(true) },
  { slug: "dom-type", outputId: "web.dom.type", label: "Type Text", description: "Enter text into an editable DOM element.", privileged: true, parameters: [...elementTarget(true), text("text", "Text", { defaultValue: "", required: true })] },
  { slug: "dom-clear", outputId: "web.dom.clear", label: "Clear Field", description: "Clear an editable DOM element.", privileged: true, parameters: elementTarget(true) },
  { slug: "dom-select", outputId: "web.dom.select", label: "Select Option", description: "Choose an option of a select element by value, label, or index.", privileged: true, parameters: [...elementTarget(true), text("value", "Value", { defaultValue: "" }), value("option", "Option")] },
  { slug: "dom-scroll", outputId: "web.dom.scroll", label: "Scroll", description: "Scroll by a delta, to an element, or until the page stops growing.", privileged: true, parameters: [...elementTarget(false), number("x", "X", 0), number("y", "Y", 0), flag("smooth", "Smooth", false), value("scroll", "Scroll Mode")] },
  { slug: "dom-keypress", outputId: "web.dom.keypress", label: "Key Press", description: "Dispatch a keyboard event, with modifier keys.", privileged: true, parameters: [...elementTarget(false), text("key", "Key", { defaultValue: "" }), value("modifiers", "Modifiers")] },
  { slug: "dom-wait_for_selector", outputId: "web.dom.wait_for_selector", label: "Wait For Selector", description: "Wait until an element is present, visible, enabled, or absent.", privileged: false, parameters: [...elementTarget(true), value("wait", "Condition")] },
  { slug: "dom-wait_for_text", outputId: "web.dom.wait_for_text", label: "Wait For Text", description: "Wait until page text appears or the page settles.", privileged: false, parameters: [text("text", "Text", { required: true }), timeoutMs, value("wait", "Condition")] },
  { slug: "dom-extract", outputId: "web.dom.extract", label: "Extract", description: "Extract text, value, or attributes from an element.", privileged: false, parameters: [...elementTarget(true), value("extract", "Read")] },
  { slug: "dom-capture_snapshot", outputId: "web.dom.capture_snapshot", label: "Capture Snapshot", description: "Capture a structured DOM snapshot.", privileged: false, parameters: [] },
  { slug: "dom-check", outputId: "web.dom.check", label: "Set Checked", description: "Set a checkbox or radio to a checked state.", privileged: true, parameters: [...elementTarget(true), flag("checked", "Checked", true)] },
  { slug: "dom-assert", outputId: "web.dom.assert", label: "Assert", description: "Verify a condition about the page and fail when it does not hold.", privileged: false, parameters: [...elementTarget(false), value("assert", "Assertion", { required: true })] },
  {
    slug: "dom-extract_list", outputId: "web.dom.extract_list", label: "Extract List",
    description: "Scrape every item of a repeating list or table into a dataset, across pages. The rows are saved without a recordOutput.",
    privileged: false, parameters: extractList, records: true,
    tags: ["scrape", "collect", "extract", "list", "table", "rows", "records", "dataset", "every page", "next page", "load more", "infinite scroll", "pagination"]
  },
  { slug: "dom-upload", outputId: "web.dom.upload", label: "Upload Files", description: "Set the files of a file input.", privileged: true, parameters: [...elementTarget(true), value("upload", "Files", { required: true })] },
  { slug: "dom-dialog", outputId: "web.dom.dialog", label: "Answer Dialog", description: "Arm the answer to the next native alert, confirm, or prompt.", privileged: true, parameters: [value("dialog", "Dialog", { required: true })] },
  { slug: "browser-tab", outputId: "web.browser.tab", label: "Browser Tab", description: "Open, switch to, or close a browser tab.", privileged: true, parameters: [value("tab", "Tab", { required: true })] },
  { slug: "browser-download", outputId: "web.browser.download", label: "Await Download", description: "Wait for a browser download to complete.", privileged: true, parameters: [value("download", "Download")] }
];

export function webDomainNodeDefinitionsFixture(): AutomationStudioNodeDefinition[] {
  return WEB_OUTPUTS.map((output) => ({
    schemaVersion: "0.1",
    id: `web.output.${output.slug}`,
    version: "1.0.0",
    label: output.label,
    description: output.description,
    category: "web",
    source: { kind: "importer", domainId: "web-automation", packageId: "@fluxiq-web-extension/domain", implementationKey: output.outputId },
    availability: { kind: "domain", domainId: "web-automation" },
    capabilities: { executable: true, stateAware: true, recordable: true },
    requiredRuntimeCapabilities: ["web.actions"],
    safety: { privileged: output.privileged, requiresOperatorApproval: output.privileged, requiredPermissions: ["web-automation.action"] },
    outputAction: { fixedOutputId: output.outputId },
    inputs: [{ id: "in", label: "In", valueType: "signal", role: "control" }],
    outputs: [
      { id: "success", label: "Success", valueType: "any", role: "success" },
      { id: "failed", label: "Failed", valueType: "any", role: "failure" },
      ...(output.records ? [{ id: "records", label: "Records", valueType: "array" as const, role: "data" as const }] : [])
    ],
    parameters: [...output.parameters, expectedState],
    tags: ["web-automation", "output", ...(output.tags ?? [])],
    ...(output.records ? { metadata: { recordsPath: EXTRACT_LIST_RECORDS_PATH } } : {})
  }));
}
