import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { applyPlan, comparableTokens, planMoves, verifyAgainst } from "../move-owners.mjs";

const STUDIO = "packages/fluxiq/src/programs/automation-studio";
const SOURCE_ROOT = "packages/fluxiq/src";
const LLM = { from: "programs/automation-studio/runtime/llm", to: "runtime/agents" };

function repository(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "move-owners-"));
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  }
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
  git("init", "-q");
  git("add", "-A");
  git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "start");
  return { root, read: (file) => fs.readFileSync(path.join(root, file), "utf8"), exists: (file) => fs.existsSync(path.join(root, file)) };
}

function move(repo, moves) {
  const options = { root: repo.root, sourceRoot: SOURCE_ROOT, moves };
  const plan = planMoves(options);
  assert.deepEqual(plan.problems, []);
  applyPlan(options, plan);
  return { options, plan };
}

test("rewrites imports both ways across a moved tree and nothing else", () => {
  const repo = repository({
    [`${STUDIO}/runtime/llm/call.ts`]: 'import { helper } from "../service/helper.ts";\nimport { sibling } from "./sibling.ts";\nexport const call = helper + sibling;\n',
    [`${STUDIO}/runtime/llm/sibling.ts`]: "export const sibling = 1;\n",
    [`${STUDIO}/runtime/service/helper.ts`]: 'export { call } from "../llm/call.ts";\nexport const helper = 2;\n',
    [`${SOURCE_ROOT}/engine/run.ts`]: 'export const untouched = "../programs/automation-studio/runtime/llm/call.ts";\n'
  });
  const { plan } = move(repo, [LLM]);
  assert.equal(repo.read(`${SOURCE_ROOT}/runtime/agents/call.ts`), 'import { helper } from "../../programs/automation-studio/runtime/service/helper.ts";\nimport { sibling } from "./sibling.ts";\nexport const call = helper + sibling;\n');
  assert.equal(repo.read(`${STUDIO}/runtime/service/helper.ts`), 'export { call } from "../../../../runtime/agents/call.ts";\nexport const helper = 2;\n');
  assert.equal(repo.read(`${SOURCE_ROOT}/engine/run.ts`), 'export const untouched = "../programs/automation-studio/runtime/llm/call.ts";\n');
  assert.equal(repo.exists(`${STUDIO}/runtime/llm`), false, "the emptied directory is removed");
  assert.equal(plan.totals.moved, 2);
});

test("follows dynamic imports, import types, mocks and sibling URLs", () => {
  const repo = repository({
    [`${STUDIO}/runtime/llm/tests/call.test.ts`]: [
      'vi.mock("../../service/helper.ts");',
      'const real = await vi.importActual("../../service/helper.ts");',
      'const lazy = await import("../../service/helper.ts");',
      'type T = typeof import("../../service/helper.ts");',
      'const root = new URL("../../service/", import.meta.url);',
      'const label = new URL("../../service/", "http://other");',
      ""
    ].join("\n"),
    [`${STUDIO}/runtime/service/helper.ts`]: "export const helper = 2;\n"
  });
  move(repo, [LLM]);
  const out = repo.read(`${SOURCE_ROOT}/runtime/agents/tests/call.test.ts`);
  const helper = "../../../programs/automation-studio/runtime/service/helper.ts";
  assert.match(out, new RegExp(`vi\\.mock\\("${helper}"\\)`));
  assert.match(out, new RegExp(`importActual\\("${helper}"\\)`));
  assert.match(out, new RegExp(`await import\\("${helper}"\\)`));
  assert.match(out, new RegExp(`typeof import\\("${helper}"\\)`));
  assert.ok(out.includes('new URL("../../../programs/automation-studio/runtime/service/", import.meta.url)'));
  assert.ok(out.includes('new URL("../../service/", "http://other")'), "a URL not relative to this file is not a module path");
});

test("never rewrites stored data paths or panel routes", () => {
  const repo = repository({
    [`${STUDIO}/runtime/llm/call.ts`]: "export const call = 1;\n",
    [`${SOURCE_ROOT}/other.ts`]: [
      'export const data = ".fluxiq/data/programs/automation-studio/runtime/llm/custom";',
      'export const route = "/api/programs/automation-studio/runtime/llm";',
      'export const page = "/programs/automation-studio/runtime/llm";',
      'export const bareInCode = "programs/automation-studio/runtime/llm/call.ts";',
      ""
    ].join("\n"),
    "docs/guide.md": "See /api/programs/automation-studio/runtime/llm and .fluxiq/data/programs/automation-studio/runtime/llm/x.\n"
  });
  const before = repo.read(`${SOURCE_ROOT}/other.ts`);
  const prose = repo.read("docs/guide.md");
  move(repo, [LLM]);
  assert.equal(repo.read(`${SOURCE_ROOT}/other.ts`), before);
  assert.equal(repo.read("docs/guide.md"), prose);
});

test("rewrites named source paths in comments, configs and export maps", () => {
  const repo = repository({
    [`${STUDIO}/runtime/llm/call.ts`]: "export const call = 1;\n",
    [`${SOURCE_ROOT}/other.ts`]: "// see `programs/automation-studio/runtime/llm/call.ts` for the rule\nexport const other = 1;\n",
    "tsconfig.base.json": '{ "fluxiq/x": ["packages/fluxiq/src/programs/automation-studio/runtime/llm/call.ts"] }\n',
    "packages/fluxiq/package.json": '{ "exports": { "./x": { "types": "./dist/programs/automation-studio/runtime/llm/call.d.ts", "import": "./dist/programs/automation-studio/runtime/llm/call.js" } } }\n',
    "docs/guide.md": "Lives in `programs/automation-studio/runtime/llm/call.ts`.\n"
  });
  move(repo, [LLM]);
  assert.match(repo.read(`${SOURCE_ROOT}/other.ts`), /see `runtime\/agents\/call\.ts` for/);
  assert.match(repo.read("tsconfig.base.json"), /packages\/fluxiq\/src\/runtime\/agents\/call\.ts/);
  assert.match(repo.read("packages/fluxiq/package.json"), /\.\/dist\/runtime\/agents\/call\.d\.ts/);
  assert.match(repo.read("packages/fluxiq/package.json"), /\.\/dist\/runtime\/agents\/call\.js/);
  assert.match(repo.read("docs/guide.md"), /`runtime\/agents\/call\.ts`/);
});

test("an import spelling out src/ is rewritten once, as an import", () => {
  const repo = repository({
    [`${STUDIO}/runtime/llm/call.ts`]: "export const call = 1;\n",
    "packages/fluxiq/tests/uses.ts": 'import { call } from "../src/programs/automation-studio/runtime/llm/call.ts";\nexport { call };\n'
  });
  move(repo, [LLM]);
  assert.equal(repo.read("packages/fluxiq/tests/uses.ts"), 'import { call } from "../src/runtime/agents/call.ts";\nexport { call };\n');
});

test("a keep rule holds a path back inside a larger move", () => {
  const repo = repository({
    [`${STUDIO}/runtime/llm/call.ts`]: 'export { kept } from "./kept/index.ts";\n',
    [`${STUDIO}/runtime/llm/kept/index.ts`]: "export const kept = 1;\n"
  });
  const keep = "programs/automation-studio/runtime/llm/kept";
  move(repo, [LLM, { from: keep, to: keep }]);
  assert.equal(repo.read(`${STUDIO}/runtime/llm/kept/index.ts`), "export const kept = 1;\n");
  assert.equal(repo.read(`${SOURCE_ROOT}/runtime/agents/call.ts`), 'export { kept } from "../../programs/automation-studio/runtime/llm/kept/index.ts";\n');
});

test("refuses to overwrite a file already at the destination", () => {
  const repo = repository({
    [`${STUDIO}/runtime/llm/call.ts`]: "export const moved = 1;\n",
    [`${SOURCE_ROOT}/runtime/agents/call.ts`]: "export const existing = 1;\n"
  });
  const plan = planMoves({ root: repo.root, sourceRoot: SOURCE_ROOT, moves: [LLM] });
  assert.equal(plan.problems.length, 1);
  assert.match(plan.problems[0], /already exists/);
});

test("merges a moved barrel into an existing one only when told to", () => {
  const files = {
    [`${STUDIO}/runtime/llm/index.ts`]: 'export * from "./call.ts";\n',
    [`${STUDIO}/runtime/llm/call.ts`]: "export const call = 1;\n",
    [`${SOURCE_ROOT}/runtime/agents/index.ts`]: 'export * from "./existing.ts";\n',
    [`${SOURCE_ROOT}/runtime/agents/existing.ts`]: "export const existing = 1;\n"
  };
  const refused = planMoves({ root: repository(files).root, sourceRoot: SOURCE_ROOT, moves: [LLM] });
  assert.equal(refused.problems.length, 1);
  const repo = repository(files);
  move(repo, [{ ...LLM, mergeBarrel: true }]);
  assert.equal(repo.read(`${SOURCE_ROOT}/runtime/agents/index.ts`), 'export * from "./existing.ts";\nexport * from "./call.ts";\n');
});

test("verification passes a path-only move and catches a changed token", () => {
  const repo = repository({
    [`${STUDIO}/runtime/llm/call.ts`]: 'import { a } from "../service/a.ts";\n// a comment\nexport const call = a + 1;\n',
    [`${STUDIO}/runtime/service/a.ts`]: 'export { call } from "../llm/call.ts";\nexport const a = 1;\n'
  });
  const { options } = move(repo, [LLM]);
  assert.deepEqual(verifyAgainst(options, "HEAD").problems, []);
  const moved = path.join(repo.root, `${SOURCE_ROOT}/runtime/agents/call.ts`);
  fs.writeFileSync(moved, fs.readFileSync(moved, "utf8").replace("a + 1", "a + 2"));
  assert.equal(verifyAgainst(options, "HEAD").problems.length, 1);
});

test("verification catches a file that went missing", () => {
  const repo = repository({ [`${STUDIO}/runtime/llm/call.ts`]: "export const call = 1;\n" });
  const { options } = move(repo, [LLM]);
  fs.rmSync(path.join(repo.root, `${SOURCE_ROOT}/runtime/agents/call.ts`));
  assert.match(verifyAgainst(options, "HEAD").problems[0], /missing/);
});

test("comments are not part of the compared program text", () => {
  const a = comparableTokens("a.ts", '// one\nimport "./x.ts";\nexport const v = 1;\n');
  const b = comparableTokens("a.ts", '/* two */\nimport "./y/z.ts";\nexport const v = 1;\n');
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, comparableTokens("a.ts", 'import "./x.ts";\nexport const v = 2;\n'));
});
