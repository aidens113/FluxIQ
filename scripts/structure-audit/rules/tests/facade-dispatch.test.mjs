// Unit tests for the facade-dispatch rule. The rule only reaches the repository
// through ctx, so these build a fake ctx by hand over in-memory fixtures: no
// git, no filesystem.
//
// The rule exists because of a regression the module size governance plan's
// Phase 7 actually shipped. A method moved out of service.ts into a
// collaborator kept calling `this.getFlowSubflow(...)`, and the extraction
// re-pointed it at `this.flows.getFlowSubflow(...)` -- the same implementation,
// the same return value, but no longer dispatched through the facade. A test
// that replaced the public method on the instance to count and bound hydration
// stopped seeing any calls at all. Type checking cannot see it and neither can
// a probe that compares return values, because nothing about the values
// changed; only the dispatch path did.
//
// The distinction the rule draws is between a collaborator (a class the facade
// directory exports -- an implementation you can reach past) and a port (an
// interface or type alias the facade itself fulfils). Going through a port is
// the fix, so it must never be flagged, and every "is flagged" case below is
// paired with the port form that must not be.

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import ts from "typescript";
import { run } from "../facade-dispatch.mjs";

function makeCtx(files) {
  const astCache = new Map();
  const keys = Object.keys(files);
  return {
    ts,
    trackedFiles: keys,
    scriptFiles: keys,
    isTestFile: (file) => /\.test\.tsx?$/.test(file) || file.split("/").includes("tests"),
    normalize: (file) => file,
    read: (file) => files[file],
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

// `src/thing.ts` is the facade because `src/thing/` exists beside it. It has one
// public method and one private one, and its directory exports a collaborator
// class plus a port type.
const BASE = {
  "src/thing.ts": [
    "export class Thing {",
    "  async readIt(id: string): Promise<string> { return await this.store.readIt(id); }",
    "  private async hidden(): Promise<void> {}",
    "}"
  ].join("\n"),
  "src/thing/store.ts": [
    "export class ThingStore {",
    "  async readIt(id: string): Promise<string> { return id; }",
    "  async hidden(): Promise<void> {}",
    "}"
  ].join("\n"),
  "src/thing/ports.ts": "export type ThingPorts = { readIt(id: string): Promise<string> };"
};

const findingsFor = (file, source) => run(makeCtx({ ...BASE, [file]: source })).filter((finding) => finding.path === file);

const collaboratorField = (call) => [
  'import type { ThingStore } from "./store.ts";',
  "export class Other {",
  "  constructor(private readonly store: ThingStore) {}",
  `  async go(): Promise<void> { ${call} }`,
  "}"
].join("\n");

const portField = (call) => [
  'import type { ThingPorts } from "./ports.ts";',
  "export class Other {",
  "  constructor(private readonly facade: ThingPorts) {}",
  `  async go(): Promise<void> { ${call} }`,
  "}"
].join("\n");

// --- Flagged: reaching a public facade method through a collaborator. ---

test("a collaborator calling a public facade method through another collaborator is flagged", () => {
  const findings = findingsFor("src/thing/other.ts", collaboratorField("await this.store.readIt('x');"));
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /this\.store\.readIt\(\)/);
  assert.equal(findings[0].severity, "fail");
  assert.equal(findings[0].ratchet, false);
});

test("it is still flagged when the collaborator declares a method of the same name", () => {
  // ThingStore.readIt exists, so this call resolves to the collaborator's own
  // method -- which is exactly the bypass: the facade's readIt is a forward, and
  // an override of it no longer runs.
  assert.equal(findingsFor("src/thing/other.ts", collaboratorField("await this.store.readIt('x');")).length, 1);
});

test("every offending call is reported, not just the first in a file", () => {
  const source = collaboratorField("await this.store.readIt('x'); await this.store.readIt('y');");
  assert.equal(findingsFor("src/thing/other.ts", source).length, 2);
});

// --- Not flagged: the port form, private callees, and everything outside. ---

test("the same call through a port type is not flagged", () => {
  assert.equal(findingsFor("src/thing/other.ts", portField("await this.facade.readIt('x');")).length, 0);
});

test("calling a private facade method through a collaborator is not flagged", () => {
  assert.equal(findingsFor("src/thing/other.ts", collaboratorField("await this.store.hidden();")).length, 0);
});

test("a collaborator calling its own method on this is not flagged", () => {
  const source = [
    "export class Other {",
    "  async readIt(id: string): Promise<string> { return id; }",
    "  async go(): Promise<void> { await this.readIt('x'); }",
    "}"
  ].join("\n");
  assert.equal(findingsFor("src/thing/other.ts", source).length, 0);
});

test("a file outside the facade directory is not flagged", () => {
  assert.equal(findingsFor("src/elsewhere/other.ts", collaboratorField("await this.store.readIt('x');")).length, 0);
});

test("a test under the facade directory is not flagged", () => {
  assert.equal(findingsFor("src/thing/tests/other.test.ts", collaboratorField("await this.store.readIt('x');")).length, 0);
});

test("a class with no sibling directory is not treated as a facade", () => {
  const files = {
    "src/lonely.ts": "export class Lonely { async readIt(): Promise<void> {} }",
    "src/other/store.ts": "export class Store { async readIt(): Promise<void> {} }",
    "src/other/user.ts": [
      'import type { Store } from "./store.ts";',
      "export class User {",
      "  constructor(private readonly store: Store) {}",
      "  async go(): Promise<void> { await this.store.readIt(); }",
      "}"
    ].join("\n")
  };
  assert.equal(run(makeCtx(files)).length, 0);
});
