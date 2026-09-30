// The files of one input or output root, as (label, absolute path) pairs in a
// stable order: what a root's digest hashes. Every label is the file's path
// relative to the repository, so the same content in two checkouts lists the
// same.
//
// A root is one of:
//   git    the git-visible files (`git-visible-files.mjs`) at or under `path`,
//          minus those at or under an `exclude` path. Ignored files are never
//          listed, which is what keeps runtime data out of every fingerprint.
//   walk   every file at or under `path` on disk, ignored or not: the ignored
//          inputs a step names (a dependency's `dist/`, the installed
//          lockfile, `.env*`) and a step's outputs. `match` keeps only file
//          names it matches; `shallow` lists one directory level; `exclude`
//          paths are skipped wherever they fall.
// A root with no file is listed once with `path: null`, so a directory or file
// appearing or disappearing changes the digest instead of hashing the same.
// A symbolic link is followed; a linked directory already walked is not
// walked twice, so a cycle ends.

import { readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";

/**
 * @param {{ kind: "git" | "walk", label: string, path: string, exclude?: string[], match?: RegExp | null, shallow?: boolean }} root
 * @param {{ repoRoot: string, gitFiles: () => Promise<string[]> }} context `gitFiles` lists the checkout, once per fingerprint
 * @returns {Promise<{ label: string, path: string | null }[]>}
 */
export async function listRootFiles(root, context) {
  const listed = root.kind === "git" ? await listGit(root, context) : await listWalk(root, context.repoRoot);
  if (listed.length === 0) return [{ label: root.label, path: null }];
  return listed.sort((left, right) => (left.label < right.label ? -1 : left.label > right.label ? 1 : 0));
}

async function listGit(root, context) {
  const base = relative(context.repoRoot, root.path);
  const excluded = (root.exclude ?? []).map((target) => relative(context.repoRoot, target));
  const within = (file, prefix) => prefix === "." || fold(file) === fold(prefix) || fold(file).startsWith(`${fold(prefix)}/`);
  const files = [];
  for (const file of await context.gitFiles()) {
    if (!within(file, base) || excluded.some((prefix) => within(file, prefix))) continue;
    files.push({ label: file, path: path.join(context.repoRoot, ...file.split("/")) });
  }
  return files;
}

async function listWalk(root, repoRoot) {
  let stats;
  try {
    stats = await stat(root.path);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  if (stats.isFile()) return [{ label: relative(repoRoot, root.path), path: root.path }];
  const files = [];
  const options = {
    excluded: new Set((root.exclude ?? []).map(key)),
    visited: new Set([key(await realpath(root.path))]),
    match: root.match ?? null,
    shallow: root.shallow === true
  };
  await walk(root.path, options, files);
  return files.map((file) => ({ label: relative(repoRoot, file), path: file }));
}

async function walk(directory, options, files) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (options.excluded.has(key(target))) continue;
    let isDirectory = entry.isDirectory();
    let isFile = entry.isFile();
    if (entry.isSymbolicLink()) {
      const linked = await stat(target);
      isDirectory = linked.isDirectory();
      isFile = linked.isFile();
      if (isDirectory) {
        const real = key(await realpath(target));
        if (options.visited.has(real)) continue;
        options.visited.add(real);
      }
    }
    if (isDirectory) {
      if (!options.shallow) await walk(target, options, files);
    } else if (isFile && (options.match === null || options.match.test(entry.name))) {
      files.push(target);
    }
  }
}

function relative(base, target) {
  const shown = path.relative(base, target);
  return (shown === "" ? "." : shown).split(path.sep).join("/");
}

function fold(text) {
  return process.platform === "win32" ? text.toLowerCase() : text;
}

function key(target) {
  return fold(path.resolve(target));
}
