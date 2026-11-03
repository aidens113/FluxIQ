// Unit tests for the program-controllers rule, over a fake ctx with real parses:
// no git, no filesystem.

import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { run } from "../program-controllers.mjs";

const PROGRAM = { path: "src/programs/panel", allowed: ["api", "ui", "index.ts"], maxFunctionLines: 4, reason: "It is a panel." };

function makeCtx(files, config = { controllerPrograms: [PROGRAM] }) {
  return {
    ts,
    CONFIG: config,
    sourceFiles: Object.keys(files),
    isTestFile: (file) => file.includes("/tests/"),
    parse: (file) => ts.createSourceFile(file, files[file], ts.ScriptTarget.Latest, true)
  };
}

const lines = (count) => Array.from({ length: count }, (_, index) => `  const v${index} = ${index};`).join("\n");

test("passes a program holding only its allowed entries, within budget", () => {
  const ctx = makeCtx({ "src/programs/panel/index.ts": "export const a = 1;\n", "src/programs/panel/api/handler.ts": `export function small() {\n${lines(2)}\n}\n`, "src/programs/panel/ui/view.ts": "export type V = 1;\n" });
  assert.deepEqual(run(ctx), []);
});

test("fails backend code in the program, and that cannot ratchet", () => {
  const [finding, ...rest] = run(makeCtx({ "src/programs/panel/runtime/engine.ts": "export const a = 1;\n" }));
  assert.equal(rest.length, 0);
  assert.equal(finding.severity, "fail");
  assert.equal(finding.ratchet, false);
  assert.match(finding.message, /may only hold api, ui, index\.ts\. It is a panel\./);
});

test("a stray file at the program's root is backend too", () => {
  assert.equal(run(makeCtx({ "src/programs/panel/service.ts": "export const a = 1;\n" })).length, 1);
});

test("counts a long function, and that ratchets", () => {
  const [finding] = run(makeCtx({ "src/programs/panel/api/handler.ts": `export function big() {\n${lines(6)}\n}\n` }));
  assert.equal(finding.value, 8);
  assert.equal(finding.limit, 4);
  assert.equal(finding.ratchet, true);
  assert.equal(finding.key, "src/programs/panel/api/handler.ts::big#1");
});

test("counts a long handler inside a registration table, and not the table", () => {
  const source = `export function registerThings(registry) {\n  registry.register({ handler: async () => {\n${lines(6)}\n  } });\n  registry.register({ handler: async () => 1 });\n${lines(10)}\n}\n`;
  const findings = run(makeCtx({ "src/programs/panel/api/handler.ts": source }));
  assert.deepEqual(findings.map((finding) => finding.key), ["src/programs/panel/api/handler.ts::handler#1"]);
});

test("a long file of short functions passes", () => {
  const source = Array.from({ length: 30 }, (_, index) => `export function f${index}() {\n${lines(2)}\n}\n`).join("");
  assert.deepEqual(run(makeCtx({ "src/programs/panel/api/handler.ts": source })), []);
});

test("tests in the program are not its backend", () => {
  assert.deepEqual(run(makeCtx({ "src/programs/panel/runtime/tests/a.test.ts": "export const a = 1;\n", "src/programs/panel/tests/b.test.ts": `function big() {\n${lines(9)}\n}\n` })), []);
});

test("does nothing outside a named program, or with none named", () => {
  assert.deepEqual(run(makeCtx({ "src/runtime/engine.ts": "export const a = 1;\n", "src/programs/panelist/engine.ts": "export const a = 1;\n" })), []);
  assert.deepEqual(run(makeCtx({ "src/programs/panel/runtime/engine.ts": "export const a = 1;\n" }, {})), []);
});
