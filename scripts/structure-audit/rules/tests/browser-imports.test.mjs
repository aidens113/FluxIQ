// Unit tests for the browser-imports rule over in-memory fixture repositories:
// no git, no filesystem.
//
// The fixture reproduces the chain that broke the web extension on 2026-09-30:
// the bundle enters Core at `automation-studio/nodes`, `nodes/routine/approval`
// value-imports the parking barrel, and a parking module imports `node:crypto`.
// Each passing case is paired with the change that must make it fail.

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import ts from "typescript";
import { run } from "../browser-imports.mjs";

const NODES = "packages/fluxiq/src/programs/automation-studio/nodes";
const PARKING = "packages/fluxiq/src/programs/automation-studio/runtime/parking";

const BUNDLES = {
  consumer: "the fixture browser bundle",
  entries: [`${NODES}/index.ts`, "packages/gateway/src/index.ts"],
  ownedElsewhere: [{ pattern: /^downstream(\/|$)/ }],
  browserPackages: ["tiny-browser-lib"]
};

const CLEAN = {
  "packages/fluxiq/package.json": JSON.stringify({ name: "fluxiq", exports: { "./contracts": { types: "./dist/contracts/index.d.ts", import: "./dist/contracts/index.js" } } }),
  "packages/fluxiq/src/contracts/index.ts": "export const CONTRACT = 1;",
  "packages/gateway/package.json": JSON.stringify({ name: "@fluxiq/gateway", exports: { ".": { import: "./dist/index.js" } } }),
  "packages/gateway/src/index.ts": 'import { CONTRACT } from "fluxiq/contracts";\nimport "tiny-browser-lib";\nexport const gateway = CONTRACT;',
  [`${NODES}/index.ts`]: 'export * from "./routine/index.js";\nimport "./theme.css";',
  [`${NODES}/theme.css`]: "a {}",
  [`${NODES}/routine/index.ts`]: 'export { approval } from "./approval.js";',
  [`${NODES}/routine/approval.ts`]: 'import { parkRun } from "../../runtime/parking/index.js";\nexport const approval = parkRun;',
  [`${PARKING}/index.ts`]: 'export { parkRun } from "./parked-run.js";\nexport { personNeededToolCalls } from "./person-needed-tool-calls.js";',
  [`${PARKING}/parked-run.ts`]: "export const parkRun = () => 1;",
  [`${PARKING}/person-needed-tool-calls.ts`]: "export function personNeededToolCalls() { return globalThis.crypto.randomUUID(); }",
  // Never reached from an entry, so its Node import is not the rule's business.
  "packages/fluxiq/src/programs/automation-studio/runtime/service/store.ts": 'import { readFile } from "node:fs/promises";\nexport const store = readFile;'
};

function makeCtx(files, bundles = BUNDLES) {
  const astCache = new Map();
  const read = (file) => {
    if (!(file in files)) throw new Error(`fixture has no ${file}`);
    return files[file];
  };
  return {
    CONFIG: { browserBundles: bundles },
    ts,
    files: Object.keys(files),
    read,
    parse: (file) => {
      if (!astCache.has(file)) astCache.set(file, ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS));
      return astCache.get(file);
    },
    dirname: (file) => path.posix.dirname(file),
    basename: (file) => path.posix.basename(file)
  };
}

const findingsWith = (overrides, bundles) => run(makeCtx({ ...CLEAN, ...overrides }, bundles));

test("the browser-reachable graph with no Node import passes", () => {
  assert.deepEqual(findingsWith({}), []);
});

test("a parking module that reintroduces node:crypto fails, with the chain from the entry", () => {
  const findings = findingsWith({
    [`${PARKING}/person-needed-tool-calls.ts`]: 'import { randomUUID } from "node:crypto";\nexport function personNeededToolCalls() { return randomUUID(); }'
  });
  assert.equal(findings.length, 1);
  const [finding] = findings;
  assert.equal(finding.key, `${PARKING}/person-needed-tool-calls.ts:1`);
  assert.equal(finding.severity, "fail");
  assert.equal(finding.ratchet, false);
  assert.match(finding.message, /Node built-in "node:crypto"/);
  for (const link of [`${NODES}/index.ts`, `${NODES}/routine/approval.ts`, `${PARKING}/index.ts`, `${PARKING}/person-needed-tool-calls.ts`]) {
    assert.ok(finding.message.includes(link), `the chain names ${link}`);
  }
});

test("a bare built-in name is a Node import too", () => {
  const findings = findingsWith({ [`${PARKING}/parked-run.ts`]: 'import { createHash } from "crypto";\nexport const parkRun = createHash;' });
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /Node built-in "crypto"/);
});

test("a dynamic import and an effect-only import are followed", () => {
  assert.equal(findingsWith({ [`${PARKING}/parked-run.ts`]: 'export const parkRun = () => import("node:fs");' }).length, 1);
  assert.equal(findingsWith({ [`${PARKING}/parked-run.ts`]: 'import "node:process";\nexport const parkRun = 1;' }).length, 1);
});

test("a type-only import is erased by the bundler and is not followed", () => {
  const typeOnly = [
    'import type { KeyObject } from "node:crypto";\nexport const parkRun = (key?: KeyObject) => key;',
    'import { type KeyObject } from "node:crypto";\nexport const parkRun = (key?: KeyObject) => key;',
    'export type { KeyObject } from "node:crypto";\nexport const parkRun = 1;'
  ];
  for (const source of typeOnly) assert.deepEqual(findingsWith({ [`${PARKING}/parked-run.ts`]: source }), [], source);
  // A value binding beside a type one still loads the module.
  assert.equal(findingsWith({ [`${PARKING}/parked-run.ts`]: 'import { type KeyObject, randomUUID } from "node:crypto";\nexport const parkRun = randomUUID;' }).length, 1);
});

test("an undeclared package is treated as Node-only; a declared browser package and one owned elsewhere are not", () => {
  const undeclared = findingsWith({ [`${PARKING}/parked-run.ts`]: 'import sqlite3 from "sqlite3";\nexport const parkRun = sqlite3;' });
  assert.equal(undeclared.length, 1);
  assert.match(undeclared[0].message, /package "sqlite3", which is not declared browser-safe/);
  assert.deepEqual(findingsWith({ [`${PARKING}/parked-run.ts`]: 'import x from "downstream/client";\nexport const parkRun = x;' }), []);
});

test("a workspace package is followed through its exports into source", () => {
  const findings = findingsWith({ "packages/fluxiq/src/contracts/index.ts": 'import { hostname } from "node:os";\nexport const CONTRACT = hostname;' });
  assert.equal(findings.length, 1);
  assert.ok(findings[0].message.includes("packages/gateway/src/index.ts"), "the chain starts at the gateway entry");
});

test("an import the walk cannot follow fails rather than ending the walk quietly", () => {
  const missingFile = findingsWith({ [`${PARKING}/index.ts`]: 'export { parkRun } from "./gone.js";' });
  assert.equal(missingFile.length, 1);
  assert.match(missingFile[0].message, /cannot be followed/);
  const missingExport = findingsWith({ "packages/gateway/src/index.ts": 'import { x } from "fluxiq/not-exported";\nexport const gateway = x;' });
  assert.equal(missingExport.length, 1);
  assert.match(missingExport[0].message, /exports no "\.\/not-exported"/);
});

test("an entry that is no longer a file fails", () => {
  const findings = findingsWith({}, { ...BUNDLES, entries: [...BUNDLES.entries, `${NODES}/removed.ts`] });
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /no longer match the bundle/);
});

test("with no browser bundles configured the rule has nothing to say", () => {
  assert.deepEqual(run(makeCtx(CLEAN, undefined)), []);
});
