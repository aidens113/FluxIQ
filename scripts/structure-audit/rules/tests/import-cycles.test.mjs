// Unit tests for the import-cycles rule over in-memory fixture repositories:
// no git, no filesystem. The ratchet itself is baseline.mjs's; these run the
// rule's findings through it, because "a baselined cycle passes and a new one
// fails" is the contract a developer meets.
//
// The fixture is the shape of the t358 cycle, cut down: a harness-options
// module read handle constants through `llm/harness.ts`, a file that only
// re-exports the harness barrel, and the barrel leads back through the
// flow-bootstrap barrel to the harness-options barrel and so to the module.
// Each passing case is paired with the change that must make it fail.

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import ts from "typescript";
import { run } from "../import-cycles.mjs";
import { applyRatchet, planBaselineAdoption } from "../../baseline.mjs";

const LLM = "src/runtime/llm";
const BOOT = "src/runtime/flow-bootstrap";

const CYCLE = {
  [`${LLM}/harness.ts`]: 'export * from "./harness/index.ts";',
  [`${LLM}/harness/index.ts`]: 'export { HANDLE_PATTERN } from "./structured-response.ts";\nexport { contextPacket } from "./context-packet.ts";',
  [`${LLM}/harness/structured-response.ts`]: 'export const HANDLE_PATTERN = "^[a-z]+$";',
  [`${LLM}/harness/context-packet.ts`]: 'import { bootstrapLimits } from "../../flow-bootstrap/index.ts";\nexport const contextPacket = () => bootstrapLimits;',
  [`${BOOT}/index.ts`]: 'export { bootstrapLimits } from "./limits.ts";',
  [`${BOOT}/limits.ts`]: 'import { handleSites } from "../llm/harness-options/index.ts";\nexport const bootstrapLimits = handleSites;',
  [`${LLM}/harness-options/index.ts`]: 'export { handleSites } from "./plan-node-handles.ts";',
  [`${LLM}/harness-options/plan-node-handles.ts`]: 'import { HANDLE_PATTERN } from "../harness.ts";\nexport const handleSites = () => new RegExp(HANDLE_PATTERN);',
  // Outside every cycle: imports into it, but nothing leads back.
  "src/app/main.ts": 'import { contextPacket } from "../runtime/llm/harness.ts";\nexport const main = contextPacket;'
};

function makeCtx(files) {
  const astCache = new Map();
  const read = (file) => {
    if (!(file in files)) throw new Error(`fixture has no ${file}`);
    return files[file];
  };
  return {
    CONFIG: {},
    ts,
    files: Object.keys(files),
    scriptFiles: Object.keys(files).filter((file) => /\.[cm]?[jt]sx?$/.test(file)),
    read,
    parse: (file) => {
      if (!astCache.has(file)) astCache.set(file, ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS));
      return astCache.get(file);
    },
    dirname: (file) => path.posix.dirname(file),
    basename: (file) => path.posix.basename(file)
  };
}

const findingsOf = (files) => run(makeCtx(files)).map((finding) => ({ ...finding, rule: "import-cycles" }));
const keysOf = (files) => findingsOf(files).map((finding) => finding.key).sort();
const baselineOf = (files) => planBaselineAdoption(findingsOf(files), { rules: {} }, {}, "import-cycles").baseline;

test("every module of a cycle is found, and nothing outside it", () => {
  assert.deepEqual(keysOf(CYCLE), [
    `${LLM}/harness-options/index.ts`,
    `${LLM}/harness-options/plan-node-handles.ts`,
    `${LLM}/harness.ts`,
    `${LLM}/harness/context-packet.ts`,
    `${LLM}/harness/index.ts`,
    `${BOOT}/index.ts`,
    `${BOOT}/limits.ts`
  ].sort());
});

test("the message names the loop the import closes and how to break it", () => {
  const finding = findingsOf(CYCLE).find((candidate) => candidate.key === `${LLM}/harness-options/plan-node-handles.ts`);
  assert.equal(finding.value, 1);
  assert.equal(finding.ratchet, true);
  assert.equal(finding.line, 1);
  const loop = [
    `${LLM}/harness-options/plan-node-handles.ts`, `${LLM}/harness.ts`, `${LLM}/harness/index.ts`, `${LLM}/harness/context-packet.ts`,
    `${BOOT}/index.ts`, `${BOOT}/limits.ts`, `${LLM}/harness-options/index.ts`, `${LLM}/harness-options/plan-node-handles.ts`
  ].join("\n      -> ");
  assert.ok(finding.message.includes(loop), finding.message);
  assert.match(finding.message, /module cycle of 7 module\(s\)/);
  assert.match(finding.message, /import from the module that owns what you need, not a barrel/);
});

test("a baselined cycle passes", () => {
  const result = applyRatchet(findingsOf(CYCLE), baselineOf(CYCLE));
  assert.deepEqual(result.failures, []);
  assert.equal(result.suppressed.length, 7);
});

test("a module that joins a baselined cycle fails, naming the new loop", () => {
  const joined = {
    ...CYCLE,
    [`${LLM}/harness-options/index.ts`]: `${CYCLE[`${LLM}/harness-options/index.ts`]}\nexport { handleLabel } from "./handle-label.ts";`,
    [`${LLM}/harness-options/handle-label.ts`]: 'import { contextPacket } from "../harness/index.ts";\nexport const handleLabel = contextPacket;'
  };
  const failures = applyRatchet(findingsOf(joined), baselineOf(CYCLE)).failures;
  // The new module has no entry, and the barrel that re-exports it gained an
  // import leading back, past its entry of 1.
  assert.deepEqual(failures.map((failure) => failure.key).sort(), [`${LLM}/harness-options/handle-label.ts`, `${LLM}/harness-options/index.ts`]);
  const joiner = failures.find((failure) => failure.key === `${LLM}/harness-options/handle-label.ts`);
  assert.match(joiner.message, /harness-options\/handle-label\.ts\n {6}-> src\/runtime\/llm\/harness\/index\.ts/);
  assert.match(failures.find((failure) => failure !== joiner).message, /Baseline for this entry is 1/);
});

test("a module already in a cycle that adds another import leading back fails", () => {
  const grown = {
    ...CYCLE,
    [`${BOOT}/limits.ts`]: `${CYCLE[`${BOOT}/limits.ts`]}\nimport { contextPacket } from "../llm/harness/index.ts";\nexport const packet = contextPacket;`
  };
  const failures = applyRatchet(findingsOf(grown), baselineOf(CYCLE)).failures;
  assert.deepEqual(failures.map((failure) => failure.key), [`${BOOT}/limits.ts`]);
  assert.match(failures[0].message, /Baseline for this entry is 1/);
});

test("a new cycle where there was none fails", () => {
  const acyclic = { ...CYCLE, [`${BOOT}/limits.ts`]: "export const bootstrapLimits = 1;" };
  assert.deepEqual(keysOf(acyclic), []);
  // main -> harness.ts -> harness/index.ts -> structured-response.ts -> main.
  const closed = { ...acyclic, [`${LLM}/harness/structured-response.ts`]: 'import "../../../app/main.ts";\nexport const HANDLE_PATTERN = "x";' };
  const failures = applyRatchet(findingsOf(closed), baselineOf(acyclic)).failures;
  assert.deepEqual(failures.map((failure) => failure.key).sort(), [
    "src/app/main.ts", `${LLM}/harness.ts`, `${LLM}/harness/index.ts`, `${LLM}/harness/structured-response.ts`
  ].sort());
});

test("importing the owner instead of the barrel breaks the cycle and lowers the entries", () => {
  const fixed = {
    ...CYCLE,
    [`${LLM}/harness-options/plan-node-handles.ts`]: 'import { HANDLE_PATTERN } from "../harness/structured-response.ts";\nexport const handleSites = () => new RegExp(HANDLE_PATTERN);'
  };
  assert.deepEqual(keysOf(fixed), []);
  assert.deepEqual(applyRatchet(findingsOf(fixed), baselineOf(CYCLE)).failures, []);
});

test("a type-only import does not count when the runtime has no cycle", () => {
  const typeOnly = (statement) => ({
    ...CYCLE,
    [`${LLM}/harness-options/plan-node-handles.ts`]: `${statement}\nexport const handleSites = () => new RegExp("^[a-z]+$");`
  });
  assert.deepEqual(keysOf(typeOnly('import type { HandlePattern } from "../harness.ts";')), []);
  assert.deepEqual(keysOf(typeOnly('export type { HandlePattern } from "../harness.ts";')), []);
});

// Under verbatimModuleSyntax `import { type A } from "x"` emits
// `import {} from "x"`, which loads "x" and so is part of the cycle.
test("an inline type specifier is still an edge, and so is a bare import", () => {
  const edge = (statement) => ({
    ...CYCLE,
    [`${LLM}/harness-options/plan-node-handles.ts`]: `${statement}\nexport const handleSites = () => 1;`
  });
  assert.ok(keysOf(edge('import { type HandlePattern } from "../harness.ts";')).includes(`${LLM}/harness-options/plan-node-handles.ts`));
  assert.ok(keysOf(edge('import "../harness.ts";')).includes(`${LLM}/harness-options/plan-node-handles.ts`));
});

test("a dynamic import runs after the graph has loaded and is not an edge", () => {
  const dynamic = {
    ...CYCLE,
    [`${LLM}/harness-options/plan-node-handles.ts`]: 'export const handleSites = async () => (await import("../harness.ts")).HANDLE_PATTERN;'
  };
  assert.deepEqual(keysOf(dynamic), []);
});

test("a module that imports itself is a cycle of one", () => {
  const findings = findingsOf({ "src/self.ts": 'import { a } from "./self.ts";\nexport const a = 1;\nexport const b = a;' });
  assert.deepEqual(findings.map((finding) => [finding.key, finding.value]), [["src/self.ts", 1]]);
});

test("a compiled-extension specifier resolves to its TypeScript source", () => {
  const findings = findingsOf({
    "src/a.ts": 'import { b } from "./b.js";\nexport const a = 1;',
    "src/b.ts": 'import { a } from "./a.js";\nexport const b = a;'
  });
  assert.deepEqual(findings.map((finding) => finding.key).sort(), ["src/a.ts", "src/b.ts"]);
});
