// Unit tests for the module-reach rule over in-memory fixture repositories:
// no git, no filesystem.
//
// The fixture is the case the rule exists for: modules that build what a model
// reads must never load the modules that hold recorded traces, directly or
// through any chain of imports. Each passing case is paired with the change
// that must make it fail.

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import ts from "typescript";
import { run } from "../module-reach.mjs";

const BOUNDARY = {
  name: "trace-free guidance",
  from: ["src/guidance/", "src/prompt.ts"],
  to: ["src/trace/", "src/not-yet-written/"],
  reason: "recorded traces must never become model guidance",
  remedy: "Pass the guidance builder plain values."
};

const BASE = {
  "src/guidance/index.ts": 'export { words } from "./words.ts";',
  "src/guidance/words.ts": 'import { plain } from "../plain/index.ts";\nexport const words = plain;',
  "src/plain/index.ts": "export const plain = 1;",
  "src/prompt.ts": 'import { words } from "./guidance/index.ts";\nexport const prompt = words;',
  "src/trace/index.ts": 'export { trace } from "./store.ts";',
  "src/trace/store.ts": "export const trace = 2;",
  // Not guidance, so it may load traces.
  "src/replayer.ts": 'import { trace } from "./trace/index.ts";\nexport const replayer = trace;'
};

function makeCtx(extra = {}, boundaries = [BOUNDARY]) {
  const files = { ...BASE, ...extra };
  const astCache = new Map();
  const read = (file) => {
    if (!(file in files)) throw new Error(`fixture has no ${file}`);
    return files[file];
  };
  return {
    CONFIG: { reachBoundaries: boundaries },
    ts,
    files: Object.keys(files),
    scriptFiles: Object.keys(files),
    read,
    isTestFile: (file) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(file),
    parse: (file) => {
      if (!astCache.has(file)) astCache.set(file, ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS));
      return astCache.get(file);
    },
    dirname: (file) => path.posix.dirname(file),
    basename: (file) => path.posix.basename(file)
  };
}

const paths = (findings) => findings.map((finding) => finding.path).sort();

test("guidance that loads no trace module passes, though other modules load one", () => {
  assert.deepEqual(run(makeCtx()), []);
});

test("a guidance module importing a trace module is refused", () => {
  const findings = run(makeCtx({ "src/guidance/words.ts": 'import { trace } from "../trace/index.ts";\nexport const words = trace;' }));
  assert.ok(findings.length > 0);
  const finding = findings.find((candidate) => candidate.path === "src/guidance/words.ts");
  assert.ok(finding, "expected the importer itself to be refused");
  assert.equal(finding.severity, "fail");
  assert.equal(finding.ratchet, false);
  assert.match(finding.message, /src\/trace\/index\.ts/);
  assert.match(finding.message, /recorded traces must never become model guidance/);
  assert.match(finding.message, /Pass the guidance builder plain values/);
});

test("a chain through ordinary modules reaches too, and the message prints it", () => {
  const findings = run(makeCtx({ "src/plain/index.ts": 'import { replayer } from "../replayer.ts";\nexport const plain = replayer;' }));
  assert.deepEqual(paths(findings), ["src/guidance/index.ts", "src/guidance/words.ts", "src/prompt.ts"]);
  const prompt = findings.find((finding) => finding.path === "src/prompt.ts");
  assert.match(prompt.message, /src\/prompt\.ts\s+-> src\/guidance\/index\.ts\s+-> src\/guidance\/words\.ts\s+-> src\/plain\/index\.ts\s+-> src\/replayer\.ts\s+-> src\/trace\/index\.ts/);
});

test("a type-only import carries no content and does not reach", () => {
  assert.deepEqual(run(makeCtx({ "src/guidance/words.ts": 'import type { Trace } from "../trace/index.ts";\nexport const words = 1;' })), []);
});

test("a dynamic import loads the module and reaches", () => {
  const findings = run(makeCtx({ "src/guidance/words.ts": 'export const words = async () => (await import("../trace/index.ts")).trace;' }));
  assert.ok(findings.some((finding) => finding.path === "src/guidance/words.ts"));
});

test("a test beside guidance may load traces", () => {
  assert.deepEqual(run(makeCtx({ "src/guidance/tests/words.test.ts": 'import { trace } from "../../trace/index.ts";' })), []);
});

test("a from entry that names no audited file is refused, so the list cannot rot", () => {
  const findings = run(makeCtx({}, [{ ...BOUNDARY, from: [...BOUNDARY.from, "src/renamed-guidance/"] }]));
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /src\/renamed-guidance\//);
});

test("no configured boundary, no findings", () => {
  assert.deepEqual(run(makeCtx({}, [])), []);
  const ctx = makeCtx();
  delete ctx.CONFIG.reachBoundaries;
  assert.deepEqual(run(ctx), []);
});

// Through a barrel that re-exports trace modules beside plain ones, only the
// bindings a module takes count: otherwise every module that touches a
// package's main barrel would reach everything that barrel re-exports.
const MIXED_BARREL = {
  "src/model/index.ts": 'export * from "./plain.ts";\nexport * from "../trace/index.ts";\nexport { trace as renamed } from "../trace/store.ts";',
  "src/model/plain.ts": "export const plainModel = 3;\nexport function helper() { return 4; }"
};

test("a binding taken from a barrel that also re-exports traces does not reach them", () => {
  assert.deepEqual(run(makeCtx({ ...MIXED_BARREL, "src/guidance/words.ts": 'import { plainModel, helper } from "../model/index.ts";\nexport const words = plainModel + helper();' })), []);
});

test("a trace binding taken through that barrel reaches, by star and by rename", () => {
  for (const name of ["trace", "renamed"]) {
    const findings = run(makeCtx({ ...MIXED_BARREL, "src/guidance/words.ts": `import { ${name} } from "../model/index.ts";\nexport const words = ${name};` }));
    const finding = findings.find((candidate) => candidate.path === "src/guidance/words.ts");
    assert.ok(finding, `expected { ${name} } to reach`);
    assert.match(finding.message, /src\/guidance\/words\.ts\s+-> src\/model\/index\.ts\s+-> src\/trace\//);
  }
});

test("a namespace import of that barrel reaches everything it re-exports", () => {
  const findings = run(makeCtx({ ...MIXED_BARREL, "src/guidance/words.ts": 'import * as model from "../model/index.ts";\nexport const words = model.plainModel;' }));
  assert.ok(findings.some((finding) => finding.path === "src/guidance/words.ts"));
});

test("a module reached for one binding is followed through all its imports", () => {
  const findings = run(makeCtx({
    ...MIXED_BARREL,
    "src/model/plain.ts": 'import { trace } from "../trace/store.ts";\nexport const plainModel = 3;\nexport function helper() { return trace; }',
    "src/guidance/words.ts": 'import { plainModel } from "../model/index.ts";\nexport const words = plainModel;'
  }));
  assert.ok(findings.some((finding) => finding.path === "src/guidance/words.ts"));
});
