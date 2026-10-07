import { lstat, readFile, realpath, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Remove only Fluxiq's fixed generated outputs after validating every target. */
export async function cleanLibraryOutput(repositoryRoot) {
  const root = path.resolve(repositoryRoot);
  const packageDir = path.join(root, "packages", "fluxiq");
  for (const directory of [root, path.join(root, "packages"), packageDir]) {
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink() || path.resolve(await realpath(directory)) !== directory) {
      throw new Error("Refusing redirected library output owner");
    }
  }
  const manifest = JSON.parse(await readFile(path.join(packageDir, "package.json"), "utf8"));
  const config = JSON.parse(await readFile(path.join(packageDir, "tsconfig.build.json"), "utf8"));
  if (manifest.name !== "fluxiq" || config.compilerOptions?.outDir !== "dist"
    || config.compilerOptions?.rootDir !== "src"
    || config.compilerOptions?.tsBuildInfoFile !== "tsconfig.build.tsbuildinfo") {
    throw new Error("Refusing unexpected library output owner");
  }
  const targets = [path.join(packageDir, "dist"), path.join(packageDir, "tsconfig.build.tsbuildinfo")];
  for (const target of targets) {
    if (path.dirname(target) !== packageDir) throw new Error("Refusing outside library output");
    await validateTree(target, target.endsWith(".tsbuildinfo") ? "file" : "directory");
  }
  // Validate all targets before either deletion; no source/runtime state is owned here.
  for (const target of targets) await rm(target, { recursive: target.endsWith(`${path.sep}dist`), force: true });
}

async function validateTree(target, kind) {
  let info;
  try { info = await lstat(target); } catch (error) { if (error.code === "ENOENT") return; throw error; }
  if (info.isSymbolicLink() || (kind === "directory" ? !info.isDirectory() : !info.isFile())) {
    throw new Error("Refusing redirected or unexpected generated output");
  }
  if (path.resolve(await realpath(target)) !== path.resolve(target)) throw new Error("Refusing outside generated output");
  if (info.isDirectory()) {
    for (const item of await readdir(target, { withFileTypes: true })) {
      await validateTree(path.join(target, item.name), item.isDirectory() ? "directory" : "file");
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) throw new Error("Library cleanup accepts no target arguments");
  await cleanLibraryOutput(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
}
