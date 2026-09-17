// Unit tests for the web-vocabulary rule. The rule reaches the repository only
// through ctx, so these build a fake ctx by hand over in-memory fixtures: no
// git, no filesystem.
//
// The rule exists because FluxIQ Core is the framework every domain builds on,
// and nothing stopped one domain's vocabulary being written into a Core
// contract by hand. The near miss it was written for: the browser extension
// added "which record a control sat in", and Core's element-target normaliser
// would have had to learn a web-specific key for it to survive -- while Core's
// own neutral `entityId` / `entityKind` were sitting there unused.
//
// Three things must stay legal, and each has its own section below:
// documentation that explains the web domain, a Core test that describes the
// downstream domain to prove Core carries it opaquely, and a string that
// quotes a domain's vocabulary without Core learning it.

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import ts from "typescript";
import { run } from "../web-vocabulary.mjs";

function makeCtx(files, config = {}) {
  const astCache = new Map();
  return {
    ts,
    CONFIG: { testRootDirNames: ["tests", "e2e"], domainNeutralPaths: ["packages"], ...config },
    scriptFiles: Object.keys(files),
    isTestFile: (file) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(file),
    normalize: (file) => file,
    parse: (file) => {
      if (!astCache.has(file)) {
        astCache.set(file, ts.createSourceFile(file, files[file], ts.ScriptTarget.Latest, true, ts.ScriptKind.TS));
      }
      return astCache.get(file);
    },
    dirname: (file) => path.posix.dirname(file),
    basename: (file) => path.posix.basename(file)
  };
}

const findingsFor = (source) => run(makeCtx({ "packages/fluxiq/src/model.ts": source }));
const count = (source) => findingsFor(source).reduce((total, finding) => total + finding.value, 0);
const named = (name) => count(`export const ${name} = 1;`);

// --- Flagged: a name Core declares or reads. ---

test("a web word in a contract field is one ratcheted finding", () => {
  const findings = run(makeCtx({ "packages/contracts/src/gateway.ts": "export type Command = {\n  tabId: string;\n};" }));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, "web-vocabulary");
  assert.equal(findings[0].severity, "fail");
  assert.equal(findings[0].ratchet, true);
  assert.equal(findings[0].key, "packages/contracts/src/gateway.ts");
  assert.equal(findings[0].value, 1);
  assert.equal(findings[0].line, 2);
});

test("every position a name is written in is counted", () => {
  for (const source of [
    "export type Target = { tagName?: string };",            // a property signature
    "export const target = { tagName: value };",             // a property assignment
    "export const name = element.tagName;",                  // a property read
    "export const tagName = read();",                        // a variable
    "export function tagName() { return 1; }",               // a function
    "export const read = (tagName: string) => tagName;",     // a parameter (read twice)
    "export class Node { tagName = \"\"; }",                 // a property declaration
    "export const name = element[\"tagName\"];",             // an element access by string key
    "export const target = { \"tagName\": value };",         // a string property key
    "export enum Signal { tagName = 1 }"                     // an enum member
  ]) {
    assert.ok(count(source) >= 1, source);
  }
});

test("a name is split the way it is spelled", () => {
  for (const name of ["tabId", "activeTab", "TAB_ID", "tab_id", "setActiveTab", "Tab"]) assert.equal(named(name), 1, name);
  for (const name of ["innerHTML", "innerHtml", "readInnerHtml"]) assert.equal(named(name), 1, name);
  for (const name of ["XPath", "xpath", "xpathOf"]) assert.equal(named(name), 1, name);
  for (const name of ["iframe", "iFrame", "iframeId"]) assert.equal(named(name), 1, name);
  for (const name of ["shadowRoot", "querySelector", "userAgent", "cssText", "onClick", "scrollTop", "ariaLabel"]) {
    assert.equal(named(name), 1, name);
  }
});

test("a plural is the same word", () => {
  for (const name of ["tabs", "cookies", "classNames", "tagNames", "iframes"]) assert.equal(named(name), 1, name);
  assert.equal(named("className"), 1, "the DOM's class name attribute, whatever it is spelled beside");
});

test("a several-word term needs its words adjacent", () => {
  assert.equal(named("tagName"), 1);
  assert.equal(named("tag"), 0, "Core's own instruction tags are not the DOM's tag name");
  assert.equal(named("name"), 0);
  assert.equal(named("tagOfName"), 0);
  assert.equal(named("shadowColor"), 0, "a design token's shadow is not the shadow root");
});

test("every flagged name in a file is counted into one finding naming each term once", () => {
  const source = ["export type T = {", "  selector?: string;", "  xpath?: string;", "  tagName?: string;", "};",
    "export const read = (t: T) => t.selector;"].join("\n");
  const findings = findingsFor(source);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].value, 4);
  assert.match(findings[0].message, /4 names state web-domain concepts: "selector" at line 2, "xpath" at line 3, "tag name" at line 4/);
});

// --- Not flagged: a word Core's own vocabulary owns. ---

test("Core's own words are not the web's", () => {
  for (const name of ["domain", "domainId", "viewport", "GraphViewportRequest", "elementId", "StateElementKind",
    "visualFrameId", "url", "fileURLToPath", "FlowDocument", "MiningWindow", "screenshotRef", "primaryHover",
    "focusRing", "dropdown", "button", "htmlPath", "href", "escapeAttribute", "keyboardShortcut", "mousePosition",
    "NavigationItem", "WebSocketClient", "isHttpUrl", "table", "tabular", "selectNode"]) {
    assert.equal(named(name), 0, name);
  }
});

test("selector counts only as the whole name", () => {
  assert.equal(named("selector"), 1);
  assert.equal(named("selectors"), 1);
  assert.equal(count("export type T = { selector?: string };"), 1);
  assert.equal(named("reusableLlmContextFreshEvidenceSelector"), 0, "a callback that selects evidence is not a CSS selector");
  assert.equal(named("evidenceSelector"), 0);
  assert.equal(named("querySelector"), 1, "but this spelling is never anything else");
  assert.equal(named("cssSelector"), 1, "and css carries this one");
});

test("DOMException is the platform's error type, not the document object model", () => {
  assert.equal(count("export const abort = () => new DOMException(\"stopped\", \"TimeoutError\");"), 0);
  assert.equal(count("export function stop(reason?: DOMException) { return reason; }"), 0);
  assert.equal(named("domNode"), 1, "every other dom name is still counted");
  assert.equal(named("domSnapshot"), 1);
  assert.equal(named("DOMRect"), 1);
});

// --- Not flagged: documentation. ---

test("a comment may explain the web domain at any length", () => {
  const source = [
    "// The downstream domain records a CSS selector, an xpath and a tagName for",
    "// every click, and Core stores that blob without reading it: no iframe, no",
    "// cookie, no browser tab ever reaches a field here.",
    "/**",
    " * @param handle - the domain's opaque locator. It may hold innerHTML or an",
    " * aria-label; Core never looks.",
    " */",
    "export function store(handle: string) { return handle; }"
  ].join("\n");
  assert.equal(count(source), 0);
});

// --- Not flagged: a test that describes a downstream domain. ---

test("test files and everything under a test root are skipped", () => {
  const body = "export const target = { selector: \"#ok\", xpath: \"//a\", tabId: \"1\" };";
  const files = {
    "packages/fluxiq/src/model.test.ts": body,
    "packages/fluxiq/src/tests/support.ts": body,
    "packages/fluxiq/e2e/fixture.ts": body,
    "packages/fluxiq/src/testsuite/real.ts": body
  };
  assert.deepEqual(run(makeCtx(files)).map((finding) => finding.path), ["packages/fluxiq/src/testsuite/real.ts"]);
});

// --- Not flagged: a string that quotes a domain's own vocabulary. ---

test("a string that is not a property key is data, not a name Core learned", () => {
  for (const source of [
    "export const message = \"the selector did not match; check the xpath\";",
    "export const code = \"element_target.invalid_selector\";",
    "export const prompt = `Return the tagName and the innerHTML of the iframe`;",
    "export const sensitive = /cookie|browser|selector/i;",
    "export const promoted = new Set([\"selector\", \"xpath\", \"tagName\", \"classNames\"]);",
    "export const passthrough = [\"click\", \"scroll\", \"hover\"] as const;",
    "export const kind = value === \"click\" ? 1 : 0;"
  ]) {
    assert.equal(count(source), 0, source);
  }
});

test("but a string used as a property key is a name, read or declared", () => {
  assert.equal(count("export const read = (v: Record<string, string>) => v[\"selector\"];"), 1);
  assert.equal(count("export const built = { \"tabId\": id };"), 1);
});

// --- Scope: the configured neutral paths only. ---

test("source outside the configured neutral paths is not audited", () => {
  const body = "export const target = { selector: \"#ok\" };";
  const files = { "packages/fluxiq/src/model.ts": body, "apps/web/src/panel.ts": body, "scripts/build.mjs": body };
  assert.deepEqual(run(makeCtx(files)).map((finding) => finding.path), ["packages/fluxiq/src/model.ts"]);
});

test("an empty neutral-path list makes the rule inert, which is how the web domain's own repository mirrors it", () => {
  const files = { "domain/src/page-evidence.ts": "export const target = { selector: \"#ok\", xpath: \"//a\", tabId: \"1\" };" };
  assert.deepEqual(run(makeCtx(files, { domainNeutralPaths: [] })), []);
  assert.deepEqual(run(makeCtx(files, { domainNeutralPaths: undefined })), []);
});

// --- The message has to tell a developer what to do. ---

test("the message says what to use instead and what the baseline means", () => {
  const message = findingsFor("export type T = { tabId: string };")[0].message;
  assert.match(message, /1 name states a web-domain concept: "tab" at line 1/);
  assert.match(message, /`entityId` and `entityKind`/);
  assert.match(message, /`queryPath` or `statePath`/);
  assert.match(message, /opaque handle Core stores and returns without reading/);
  assert.match(message, /the recorded count may only fall/);
});
