import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { applyRetirement, planRetirement } from "../retire-forwarding.mjs";

const SOURCE_ROOT = "packages/fluxiq/src";

function repository(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "retire-forwarding-"));
  const all = { "packages/fluxiq/package.json": '{ "exports": {} }\n', ...files };
  for (const [file, text] of Object.entries(all)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  }
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
  git("init", "-q");
  git("add", "-A");
  return { root, read: (file) => fs.readFileSync(path.join(root, file), "utf8"), exists: (file) => fs.existsSync(path.join(root, file)) };
}

function retire(repo, directories = ["old"]) {
  const options = { root: repo.root, sourceRoot: SOURCE_ROOT, directories };
  const plan = planRetirement(options);
  assert.deepEqual(plan.problems, []);
  applyRetirement(options, plan);
  return plan;
}

const s = (file) => `${SOURCE_ROOT}/${file}`;

test("points importers at the real module and deletes the forwarder", () => {
  const repo = repository({
    [s("real/thing.ts")]: "export const thing = 1;\n",
    [s("old/alias.ts")]: '// Compatibility exports.\nexport { thing } from "../real/thing.ts";\n',
    [s("user.ts")]: 'import { thing } from "./old/alias.ts";\nexport const used = thing;\n'
  });
  const plan = retire(repo);
  assert.deepEqual(plan.retired, [s("old/alias.ts")]);
  assert.equal(repo.read(s("user.ts")), 'import { thing } from "./real/thing.ts";\nexport const used = thing;\n');
  assert.equal(repo.exists(s("old")), false);
});

test("follows a chain of forwarders to the end", () => {
  const repo = repository({
    [s("real/thing.ts")]: "export const thing = 1;\n",
    [s("old/a.ts")]: 'export * from "./b.ts";\n',
    [s("old/b.ts")]: 'export * from "../real/thing.ts";\n',
    [s("user.ts")]: 'import { thing } from "./old/a.ts";\nexport const used = thing;\n'
  });
  retire(repo);
  assert.equal(repo.read(s("user.ts")), 'import { thing } from "./real/thing.ts";\nexport const used = thing;\n');
});

test("also retargets mocks in tests", () => {
  const repo = repository({
    [s("real/thing.ts")]: "export const thing = 1;\n",
    [s("old/alias.ts")]: 'export { thing } from "../real/thing.ts";\n',
    [s("area/tests/a.test.ts")]: 'vi.mock("../../old/alias.ts");\n'
  });
  retire(repo);
  assert.equal(repo.read(s("area/tests/a.test.ts")), 'vi.mock("../../real/thing.ts");\n');
});

test("leaves anything that does more than forward", () => {
  const repo = repository({
    [s("real/thing.ts")]: "export const thing = 1;\nexport const other = 2;\n",
    [s("old/renames.ts")]: 'export { thing as renamed } from "../real/thing.ts";\n',
    [s("old/logic.ts")]: 'export { thing } from "../real/thing.ts";\nexport const extra = 1;\n',
    [s("old/two.ts")]: 'export { thing } from "../real/thing.ts";\nexport { helper } from "./helper.ts";\n',
    [s("old/helper.ts")]: "export const helper = 1;\n"
  });
  const plan = retire(repo);
  assert.deepEqual(plan.retired, []);
});

test("keeps a directory's own barrel, retires one that points elsewhere", () => {
  const repo = repository({
    [s("real/thing.ts")]: "export const thing = 1;\n",
    [s("old/inner/index.ts")]: 'export * from "./one.ts";\n',
    [s("old/inner/one.ts")]: "export const one = 1;\n",
    [s("old/elsewhere/index.ts")]: 'export * from "../../real/thing.ts";\n',
    [s("user.ts")]: 'import { thing } from "./old/elsewhere/index.ts";\nimport { one } from "./old/inner/index.ts";\nexport const used = [thing, one];\n'
  });
  const plan = retire(repo);
  assert.deepEqual(plan.retired, [s("old/elsewhere/index.ts")]);
  assert.equal(repo.exists(s("old/inner/index.ts")), true);
});

test("holds back a named forwarder another module re-exports wholesale", () => {
  const repo = repository({
    [s("real/thing.ts")]: "export const thing = 1;\nexport const secret = 2;\n",
    [s("old/alias.ts")]: 'export { thing } from "../real/thing.ts";\n',
    [s("barrel.ts")]: 'export * from "./old/alias.ts";\n'
  });
  const plan = retire(repo);
  assert.deepEqual(plan.retired, []);
  assert.deepEqual(plan.held, [s("old/alias.ts")]);
  assert.equal(repo.read(s("barrel.ts")), 'export * from "./old/alias.ts";\n');
});

test("keeps a module a package export names", () => {
  const repo = repository({
    "packages/fluxiq/package.json": '{ "exports": { "./x": { "types": "./dist/old/alias.d.ts", "import": "./dist/old/alias.js" } } }\n',
    [s("real/thing.ts")]: "export const thing = 1;\n",
    [s("old/alias.ts")]: 'export { thing } from "../real/thing.ts";\n'
  });
  const plan = retire(repo);
  assert.deepEqual(plan.retired, []);
});

test("keeps a module the compiler paths or the audit name", () => {
  const repo = repository({
    "tsconfig.base.json": '{ "paths": { "x": ["packages/fluxiq/src/old/a.ts"] } }\n',
    "scripts/structure-audit/config.mjs": 'export const entries = ["packages/fluxiq/src/old/b.ts"];\n',
    [s("real/thing.ts")]: "export const thing = 1;\n",
    [s("old/a.ts")]: 'export { thing } from "../real/thing.ts";\n',
    [s("old/b.ts")]: 'export { thing } from "../real/thing.ts";\n',
    [s("old/c.ts")]: 'export { thing } from "../real/thing.ts";\n'
  });
  const plan = retire(repo);
  assert.deepEqual(plan.retired, [s("old/c.ts")]);
});

test("only looks inside the named directories", () => {
  const repo = repository({
    [s("real/thing.ts")]: "export const thing = 1;\n",
    [s("elsewhere/alias.ts")]: 'export { thing } from "../real/thing.ts";\n'
  });
  const plan = retire(repo);
  assert.deepEqual(plan.retired, []);
});
