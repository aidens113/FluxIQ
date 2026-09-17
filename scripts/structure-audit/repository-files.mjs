// The files the structure audit sees: every file git tracks, plus every
// untracked file git does not ignore.
//
// Listing tracked files alone let a new file through: it was not audited until
// after it had been committed, so a worker's clean audit run said nothing about
// the file it had just written. Adding the untracked, not-ignored files makes
// the audit see what `git add -A` would commit. Ignored files stay out, so
// build output and runtime state are never audited.
//
// A tracked path that no longer exists in the working tree (deleted but not
// yet staged) is dropped, since there is nothing left to read, and so is any
// entry that is not a regular file: a submodule, or an untracked nested
// repository, which git lists as a directory. Paths are POSIX, unique, and
// sorted, whatever order git printed them in.

import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import path from "node:path";

export function listRepositoryFiles(root) {
  const out = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024
  });
  const files = new Set(out.split("\0").filter(Boolean).map((file) => file.replaceAll("\\", "/")));
  return [...files].filter((file) => isRegularFile(path.join(root, file))).sort();
}

// A missing path, or one whose parent is now a file (ENOTDIR), is not a file.
function isRegularFile(absolute) {
  try {
    return statSync(absolute).isFile();
  } catch {
    return false;
  }
}
