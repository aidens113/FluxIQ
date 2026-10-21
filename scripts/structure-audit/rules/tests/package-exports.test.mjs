// Unit tests for the package-exports rule over in-memory fixture repositories:
// no git, no filesystem.
//
// The fixture is shaped like the case that motivated the rule: a test runner
// that loaded modules its linked Core package does not export, by building an
// address beside the package's entry and importing files out of its build.
// Every refused shape is paired with the nearby shape that must still pass,
// above all a string that names a build path without loading it.

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import ts from "typescript";
import { run } from "../package-exports.mjs";

const CORE_MANIFEST = JSON.stringify({
  name: "fluxiq",
  exports: {
    ".": { types: "./dist/index.d.ts", import: "./dist/index.js" },
    "./automation-studio": { types: "./dist/automation-studio/index.d.ts", import: "./dist/automation-studio/index.js" },
    "./nodes/*": { import: "./dist/nodes/*.js" },
    "./blocked/secret": null
  }
});

const BASE = {
  "package.json": JSON.stringify({ name: "fixture-root" }),
  // Linked from outside the repository, as the downstream repository links Core.
  "packages/runner/package.json": JSON.stringify({ name: "@fx/runner", exports: { ".": "./dist/index.js" }, dependencies: { fluxiq: "link:../../../core/packages/fluxiq", "@fx/lib": "workspace:*", typescript: "^5.0.0" } }),
  "../core/packages/fluxiq/package.json": CORE_MANIFEST,
  "packages/lib/package.json": JSON.stringify({ name: "@fx/lib", exports: { ".": "./dist/index.js", "./node": { default: "./dist/node.js" } } }),
  "packages/lib/src/index.ts": "export const lib = 1;",
  "packages/open/package.json": JSON.stringify({ name: "@fx/open", main: "./dist/index.js" }),
  "packages/runner/src/index.ts": "export const runner = 1;",
  // What tsc checks: the runner's sources, and through a second project its
  // e2e harnesses and the tests the first one excludes.
  "packages/runner/tsconfig.json": JSON.stringify({ compilerOptions: { outDir: "dist" }, include: ["src/**/*.ts"], exclude: ["src/**/tests/**"] }),
  "packages/runner/tsconfig.test.json": `{
    // check-only
    "extends": "./tsconfig.json",
    "compilerOptions": { "noEmit": true },
    "include": ["src/**/*.ts", "e2e/**/*.ts"],
    "exclude": []
  }`,
  // A build that writes somewhere other than dist/, named by its tsconfig and
  // by its manifest's export targets.
  "packages/app/package.json": JSON.stringify({ name: "@fx/app" }),
  "packages/app/tsconfig.json": '{ /* emit */ "compilerOptions": { "outDir": "./build" } }',
  "packages/out/package.json": JSON.stringify({ name: "@fx/out", exports: { ".": "./out/index.js" } })
};

const RUNNER = "packages/runner/src/probe.ts";

function makeCtx(extra) {
  const files = { ...BASE, ...extra };
  const astCache = new Map();
  const read = (file) => {
    if (!(file in files)) throw new Error(`fixture has no ${file}`);
    return files[file];
  };
  const audited = Object.keys(files).filter((file) => !file.startsWith("../"));
  const scripts = audited.filter((file) => /\.[cm]?[jt]sx?$/.test(file));
  return {
    CONFIG: {},
    ts,
    files: audited,
    scriptFiles: scripts,
    read,
    parse: (file) => {
      if (!astCache.has(file)) astCache.set(file, ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, file.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS));
      return astCache.get(file);
    },
    dirname: (file) => path.posix.dirname(file),
    basename: (file) => path.posix.basename(file)
  };
}

const findingsFor = (source, file = RUNNER) => run(makeCtx({ [file]: source })).filter((finding) => finding.path === file);
const refused = (source, file) => findingsFor(source, file).length > 0;

test("an import of a subpath the package exports passes", () => {
  assert.equal(refused('import { x } from "fluxiq/automation-studio";\nimport { y } from "fluxiq";\nimport { z } from "@fx/lib/node";'), false);
});

test("a static import of a subpath the exports map does not name is refused", () => {
  const [finding] = findingsFor('import { scope } from "fluxiq/dist/automation-studio/runtime/scope.js";');
  assert.ok(finding, "expected a finding");
  assert.equal(finding.line, 1);
  assert.match(finding.message, /fluxiq\/dist\/automation-studio\/runtime\/scope\.js/);
  assert.match(finding.message, /exports/);
});

test("a type-only import is an import too", () => {
  assert.equal(refused('import type { Scope } from "fluxiq/runtime/scope";'), true);
});

test("a dynamic import, a require and a created require of an unexported subpath are refused", () => {
  assert.equal(refused('const m = await import("fluxiq/runtime/scope.js");'), true);
  assert.equal(refused('const m = require("@fx/lib/src/index.ts");', "packages/runner/src/probe.cjs"), true);
  assert.equal(refused('import { createRequire } from "node:module";\nconst load = createRequire(import.meta.url);\nload.resolve("fluxiq/runtime/scope.js");'), true);
  assert.equal(refused('import { createRequire } from "node:module";\ncreateRequire(import.meta.url)("fluxiq/runtime/scope.js");'), true);
});

test("a subpath matching an exports pattern passes, and a null target is not exported", () => {
  assert.equal(refused('import { a } from "fluxiq/nodes/alpha";'), false);
  assert.equal(refused('import { b } from "fluxiq/blocked/secret";'), true);
});

test("a package without an exports map, and a package the repository does not link, are not this rule's business", () => {
  assert.equal(refused('import { o } from "@fx/open/dist/anything.js";'), false);
  assert.equal(refused('const tsc = require.resolve("typescript/lib/tsc.js");'), false);
});

test("import.meta.resolve of an unexported subpath is refused; of an exported one it passes", () => {
  assert.equal(refused('const url = import.meta.resolve("fluxiq/runtime/scope.js");'), true);
  assert.equal(refused('const url = import.meta.resolve("fluxiq/automation-studio");'), false);
});

test("a module address built beside a package entry is refused", () => {
  const findings = findingsFor('const core = new URL("./", import.meta.resolve("fluxiq/automation-studio"));\nconst scope = await import(new URL("runtime/scope.js", core).href);');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 1);
  assert.match(findings[0].message, /beside/);
  assert.equal(refused('const m = await import(new URL("./runtime/scope.js?copy=1", import.meta.resolve("fluxiq/automation-studio")).href);'), true);
});

test("a load of a path into another package's build, written relatively or from a repository root, is refused", () => {
  assert.equal(refused('const m = await import(pathToFileURL(path.join(root, "packages/lib/dist/index.js")).href);'), true);
  assert.equal(refused('const m = await import("../packages/runner/dist/index.js");', "scripts/run.mjs"), true);
  // A linked package outside the repository, named from its own repository's root.
  assert.equal(refused('const m = await import(pathToFileURL(path.join(coreRoot, "packages/fluxiq/dist/index.js")).href);'), true);
  assert.equal(refused("const m = await import(`${coreRoot}/packages/fluxiq/dist/index.js`);"), true);
});

test("any path into a package linked from outside the repository is refused, whatever it names and however it is loaded", () => {
  assert.equal(refused('import { api } from "../../../../core/packages/fluxiq/src/index.ts";'), true);
  assert.equal(refused('const m = await import("../../../../core/packages/fluxiq/scripts/x.mjs");'), true);
  assert.equal(refused('const manifest = require(path.join(coreRoot, "packages/fluxiq/package.json"));', "packages/runner/src/probe.cjs"), true);
});

test("a load of another workspace package's build output is refused wherever its build writes", () => {
  assert.equal(refused('import { lib } from "../../lib/dist/index.js";'), true);
  assert.equal(refused('const m = await import("../packages/app/build/main.js");', "scripts/run.mjs"), true);
  assert.equal(refused('const m = await import("../packages/out/out/index.js");', "scripts/run.mjs"), true);
  assert.equal(refused('const m = await import("../packages/app/scripts/helper.mjs");', "scripts/run.mjs"), false);
});

test("a static import of a sibling workspace package's TypeScript source from a type-checked file passes", () => {
  assert.equal(refused('import { lib } from "../../lib/src/index.ts";'), false);
  assert.equal(refused('export { lib } from "../../lib/src/index.js";\nimport type { Lib } from "../../lib/src/index.ts";'), false);
  assert.equal(refused('import { lib } from "../../../lib/src/index.ts";', "packages/runner/e2e/content/probe.ts"), false);
  assert.equal(refused('import { lib } from "../../../lib/src/index.ts";', "packages/runner/src/tests/probe.ts"), false);
});

test("a load of another workspace package's source that tsc does not check is refused", () => {
  assert.equal(refused('const m = await import("../../lib/src/index.ts");'), true);
  assert.equal(refused('import { lib } from "../../lib/src/index.ts";', "packages/runner/scripts/probe.ts"), true);
  assert.equal(refused('import { lib } from "../packages/lib/src/index.ts";', "scripts/run.mjs"), true);
});

test("an address built beside a workspace package's entry is refused too", () => {
  assert.equal(refused('const lib = new URL("./", import.meta.resolve("@fx/lib/node"));'), true);
});

test("a package may load its own build", () => {
  assert.equal(refused('const m = await import(pathToFileURL(path.join(root, "packages/runner/dist/index.js")).href);'), false);
  assert.equal(refused('import { runner } from "./index.ts";'), false);
});

test("a build path in a string that is not loaded passes", () => {
  assert.equal(refused('const built = path.join(root, "packages/lib/dist/index.js");\nif (!existsSync(built)) throw new Error("stale");\nconst note = "packages/fluxiq/dist/index.js";'), false);
});

test("each refused file is one ratcheted finding counting its sites", () => {
  const findings = findingsFor('import "fluxiq/a.js";\nimport "fluxiq/b.js";');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].value, 2);
  assert.equal(findings[0].key, RUNNER);
  assert.equal(findings[0].ratchet, true);
  assert.equal(findings[0].severity, "fail");
});

test("an unreadable linked package fails loudly instead of passing its imports", () => {
  const ctx = makeCtx({ [RUNNER]: 'import "gone/x.js";', "packages/gone-user/package.json": JSON.stringify({ name: "@fx/gone-user", dependencies: { gone: "link:../../../missing/gone" } }) });
  assert.throws(() => run(ctx), /missing\/gone/);
});

test("a tsconfig that cannot be parsed fails loudly instead of guessing what tsc checks", () => {
  const ctx = makeCtx({ [RUNNER]: 'import { lib } from "../../lib/src/index.ts";', "packages/lib/tsconfig.json": "[1, 2]" });
  assert.throws(() => run(ctx), /cannot be parsed/);
});
