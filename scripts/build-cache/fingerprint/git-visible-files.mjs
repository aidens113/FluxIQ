// Every file git would show in this checkout: tracked files plus untracked
// files that no ignore rule covers (`git ls-files -z -co --exclude-standard`),
// as sorted repository-relative paths with forward slashes.
//
// This is what a Core step's fingerprint lists instead of walking the tree.
// Core writes runtime data into ignored package directories -- recordings,
// indexes, storage, flows, pipeline (`.gitignore`) -- that no build or check
// reads, so they must never invalidate one. An ignored file a step does read
// is named in the registry (`ignoredInputs`, or a dependency's `dist/`) and
// walked on its own. A tracked file deleted from the disk is still listed; it
// hashes as absent.
//
// A checkout git cannot list (no git, or not a repository) cannot prove its
// inputs, so this throws an error with `code: "BUILD_CACHE_NO_GIT"` and
// `runStep` runs the command without the cache.

import { execFile } from "node:child_process";

/**
 * @param {string} repoRoot
 * @returns {Promise<string[]>}
 */
export function gitVisibleFiles(repoRoot) {
  return new Promise((resolve, reject) => {
    const args = ["-C", repoRoot, "ls-files", "-z", "--cached", "--others", "--exclude-standard"];
    execFile("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        const failure = new Error(`build-cache: git could not list the files of ${repoRoot} (${String(stderr || error.message).trim()})`);
        failure.code = "BUILD_CACHE_NO_GIT";
        reject(failure);
        return;
      }
      const files = [...new Set(stdout.split("\0").filter((entry) => entry !== ""))];
      resolve(files.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0)));
    });
  });
}
