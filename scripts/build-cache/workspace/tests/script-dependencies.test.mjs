import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { decideStep, REPOSITORY_ROOT, resolveStep } from "../../index.mjs";
import { makeScratchWorkspace, putFile, SCRATCH_STEPS } from "../../tests/scratch-workspace.mjs";

let repo;
beforeEach(async () => { repo = await makeScratchWorkspace("core-script-closure-"); });
afterEach(async () => { await rm(repo, { recursive: true, force: true }); });
const decide = () => decideStep("contracts:build", { repoRoot: repo, steps: SCRATCH_STEPS, env: { FLUXIQ_BUILD_CACHE_DIR: "off" } });

test("all real library builds fingerprint the declaration resolver through its public barrel", () => {
  for (const name of ["contracts:build", "fluxiq:build", "client-gateway-websocket:build"]) {
    const roots = resolveStep(name, { repoRoot: REPOSITORY_ROOT, env: {} }).roots;
    for (const file of ["scripts/rewrite-declaration-imports.mjs", "scripts/declarations/index.mjs", "scripts/declarations/public-import-resolver.mjs"]) {
      assert.ok(roots.some((root) => root.label === file), `${name}: ${file}`);
    }
  }
});

test("direct, barrel, transitive and literal dynamic script dependencies affect actual fingerprints", async () => {
  const entry = "packages/contracts/build.mjs";
  const original = await readFile(path.join(repo, entry), "utf8");
  await putFile(repo, entry, `import '../../scripts/helpers/index.mjs';\n${original}`);
  await putFile(repo, "scripts/helpers/index.mjs", 'export * from "./leaf.mjs";\n');
  await putFile(repo, "scripts/helpers/leaf.mjs", 'import("./dynamic.mjs");\nimport "./index.mjs";\nexport const value = 1;\n');
  // Discovery must not execute even an imported module that throws.
  await putFile(repo, "scripts/helpers/dynamic.mjs", 'throw new Error("never execute discovery");\n');
  let previous = (await decide()).fingerprint;
  const roots = resolveStep("contracts:build", { repoRoot: repo, steps: SCRATCH_STEPS }).roots;
  for (const file of ["index.mjs", "leaf.mjs", "dynamic.mjs"]) {
    assert.ok(roots.some((root) => root.label === `scripts/helpers/${file}`));
    const target = `scripts/helpers/${file}`;
    await putFile(repo, target, `${await readFile(path.join(repo, target), "utf8")}\n// changed ${file}\n`);
    const next = (await decide()).fingerprint;
    assert.notEqual(next, previous, `${file} invalidates its owning command`);
    previous = next;
  }
  await putFile(repo, "scripts/unrelated.mjs", "export const unused = true;\n");
  await putFile(repo, "packages/contracts/dist/ignored-output.mjs", "generated output\n");
  assert.equal((await decide()).fingerprint, previous, "unrelated scripts and outputs are excluded");
  const again = resolveStep("contracts:build", { repoRoot: repo, steps: SCRATCH_STEPS }).roots;
  assert.deepEqual(again.map((root) => root.label), roots.map((root) => root.label), "cycles produce deterministic roots");
});

test("missing local dependencies fail explicitly instead of allowing a current cache decision", async () => {
  await putFile(repo, "packages/contracts/build.mjs", 'import "../../scripts/missing.mjs";\n');
  await assert.rejects(decide(), /ENOENT/);
});

test("installed and escaping relative modules are never traversed", async () => {
  for (const specifier of ["../../node_modules/private/entry.mjs", "../../../outside.mjs"]) {
    await putFile(repo, "packages/contracts/build.mjs", `import ${JSON.stringify(specifier)};\n`);
    if (specifier.includes("node_modules")) {
      await putFile(repo, "node_modules/private/entry.mjs", "export {};\n");
      await assert.rejects(decide(), /not a repository-local module/);
    } else await assert.rejects(decide(), /ENOENT|not a repository-local module/);
  }
});
