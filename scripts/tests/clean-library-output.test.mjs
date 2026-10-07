import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, realpath } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { test } from "node:test";
import { cleanLibraryOutput } from "../clean-library-output.mjs";

async function fixture(run) {
  const parent = await realpath(os.tmpdir());
  const root = await mkdtemp(path.join(parent, "fluxiq-clean-test-"));
  try {
    const owner = path.join(root, "packages", "fluxiq");
    await mkdir(path.join(owner, "src"), { recursive: true });
    await writeFile(path.join(owner, "package.json"), JSON.stringify({ name: "fluxiq" }));
    await writeFile(path.join(owner, "tsconfig.build.json"), JSON.stringify({ compilerOptions: { outDir: "dist", rootDir: "src", tsBuildInfoFile: "tsconfig.build.tsbuildinfo" } }));
    await writeFile(path.join(owner, "src", "keep.ts"), "source");
    await run(root, owner);
  } finally {
    const target = await realpath(root);
    assert.equal(path.dirname(target), parent);
    assert.ok(path.basename(target).startsWith("fluxiq-clean-test-"));
    await rm(target, { recursive: true, force: true });
  }
}

test("removes relocated orphan output and buildinfo, preserves source and unrelated package", async () => fixture(async (root, owner) => {
  await mkdir(path.join(owner, "dist", "old", "nested"), { recursive: true });
  await writeFile(path.join(owner, "dist", "old", "nested", "orphan.js"), "old");
  await writeFile(path.join(owner, "tsconfig.build.tsbuildinfo"), "old");
  const other = path.join(root, "packages", "contracts");
  await mkdir(other); await writeFile(path.join(other, "keep"), "other");
  await cleanLibraryOutput(root);
  await assert.rejects(readFile(path.join(owner, "dist", "old", "nested", "orphan.js")), { code: "ENOENT" });
  await assert.rejects(readFile(path.join(owner, "tsconfig.build.tsbuildinfo")), { code: "ENOENT" });
  assert.equal(await readFile(path.join(owner, "src", "keep.ts"), "utf8"), "source");
  assert.equal(await readFile(path.join(other, "keep"), "utf8"), "other");
  await cleanLibraryOutput(root);
}));

test("refuses unexpected package/config before deleting output", async () => fixture(async (root, owner) => {
  await mkdir(path.join(owner, "dist"));
  await writeFile(path.join(owner, "dist", "keep"), "safe");
  await writeFile(path.join(owner, "package.json"), '{"name":"other"}');
  await assert.rejects(cleanLibraryOutput(root), /unexpected library/);
  assert.equal(await readFile(path.join(owner, "dist", "keep"), "utf8"), "safe");
}));

test("refuses output junction and preserves its destination", async () => fixture(async (root, owner) => {
  const outside = path.join(root, "unrelated"); await mkdir(outside);
  await writeFile(path.join(outside, "keep"), "safe");
  await symlink(outside, path.join(owner, "dist"), "junction");
  await assert.rejects(cleanLibraryOutput(root), /redirected/);
  assert.equal(await readFile(path.join(outside, "keep"), "utf8"), "safe");
}));

test("refuses nested junction before deleting any owned outputs", async () => fixture(async (root, owner) => {
  await mkdir(path.join(owner, "dist"));
  const outside = path.join(root, "unrelated"); await mkdir(outside);
  await symlink(outside, path.join(owner, "dist", "redirected"), "junction");
  await writeFile(path.join(owner, "tsconfig.build.tsbuildinfo"), "safe");
  await assert.rejects(cleanLibraryOutput(root), /redirected/);
  assert.equal(await readFile(path.join(owner, "tsconfig.build.tsbuildinfo"), "utf8"), "safe");
}));


test("refuses redirected package owner before reaching its outputs", async () => fixture(async (root, owner) => {
  const moved = path.join(root, "unrelated-owner");
  const { rename } = await import("node:fs/promises");
  await rename(owner, moved);
  await symlink(moved, owner, "junction");
  await assert.rejects(cleanLibraryOutput(root), /redirected library/);
  assert.equal(await readFile(path.join(moved, "src", "keep.ts"), "utf8"), "source");
}));

test("refuses unexpected buildinfo directory before removing dist", async () => fixture(async (root, owner) => {
  await mkdir(path.join(owner, "dist"));
  await writeFile(path.join(owner, "dist", "keep"), "safe");
  await mkdir(path.join(owner, "tsconfig.build.tsbuildinfo"));
  await assert.rejects(cleanLibraryOutput(root), /unexpected generated/);
  assert.equal(await readFile(path.join(owner, "dist", "keep"), "utf8"), "safe");
}));
