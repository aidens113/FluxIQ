import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { test } from "node:test";
import { buildCoreRuntimeIdentity, normalizedIdentityReader } from "../index.mjs";
import { coversPath, resolveStep } from "../../build-cache/index.mjs";

test("payload normalization refuses missing/multiple/malformed slots and hashes surrounding semantics", () => {
  const code = '/* core-runtime-identity:start */\nconst embedded = \'{"fluxiqRuntimeIdentityPlaceholder":302}\';\n/* core-runtime-identity:end */\nexport const actual = 1;';
  assert.equal(normalizedIdentityReader(code, '"other"').includes('actual = 1'), true);
  for (const bad of ["", code + code, code.replace("const embedded", "let embedded")]) assert.throws(() => normalizedIdentityReader(bad));
});

test("Core build cache fingerprints nested generator sources and requires the identity output", () => {
  const step = resolveStep("fluxiq:build");
  for (const file of ["build.mjs", "normalize.mjs", "index.mjs"]) assert.equal(coversPath(path.join(step.repoRoot, "scripts/runtime-build-identity", file), step), true);
  assert.ok(step.required.some(file => file.endsWith("runtime-build-identity.json")));
});

test("build stamp changes for executed code, source freshness and reader semantics; repeated embedding stays deterministic", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "core-runtime-stamp-"));
  try {
    for (const pkg of ["fluxiq", "contracts"]) {
      await mkdir(path.join(root, `packages/${pkg}/src`), { recursive: true });
      await mkdir(path.join(root, `packages/${pkg}/dist`), { recursive: true });
      await writeFile(path.join(root, `packages/${pkg}/package.json`), '{"version":"1.0.0"}');
      await writeFile(path.join(root, `packages/${pkg}/src/index.ts`), "export const x = 1;");
      await writeFile(path.join(root, `packages/${pkg}/dist/index.js`), "export const x = 1;");
    }
    const reader = path.join(root, "packages/fluxiq/dist/runtime/build-identity/read.js");
    await mkdir(path.dirname(reader), { recursive: true });
    await writeFile(reader, '/* core-runtime-identity:start */\nconst embedded = \'{"fluxiqRuntimeIdentityPlaceholder":302}\';\n/* core-runtime-identity:end */\nexport const actual = 1;');
    const first = await buildCoreRuntimeIdentity(root);
    assert.deepEqual(await buildCoreRuntimeIdentity(root), first);
    const oldStamp = await readFile(path.join(root, "packages/fluxiq/dist/runtime-build-identity.json"), "utf8");
    await writeFile(path.join(root, "packages/fluxiq/src/index.ts"), "export const x = 2;");
    assert.deepEqual(await buildCoreRuntimeIdentity(root), first);
    assert.notEqual(await readFile(path.join(root, "packages/fluxiq/dist/runtime-build-identity.json"), "utf8"), oldStamp);
    await writeFile(path.join(root, "packages/fluxiq/dist/index.js"), "export const x = 2;");
    const changed = await buildCoreRuntimeIdentity(root);
    assert.notEqual(changed.artifactDigest, first.artifactDigest);
    await writeFile(reader, (await readFile(reader, "utf8")).replace("actual = 1", "actual = 2"));
    assert.notEqual((await buildCoreRuntimeIdentity(root)).artifactDigest, changed.artifactDigest);
  } finally { await rm(root, { recursive: true, force: true }); }
});
