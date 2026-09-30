// The store's layout, in one place (all under Core's namespace, see
// `store-directory.mjs`):
//
//   <store>/v1/<key>/entry.json   what the entry is (see save-entry.mjs); its
//                                 mtime is when it was last used
//   <store>/v1/<key>/files/<n>    the n-th output file's bytes
//   <store>/tmp/<pid>-<uuid>/     an entry being written, renamed into v1/ only
//                                 once it is complete
//
// `<key>` is the step's fingerprint for a relocatable result, which any
// checkout with the same inputs may restore. A result whose outputs name the
// tree they were built in (Next's `.next`, for one) is keyed by the sha256 of
// the fingerprint and that tree's root instead, and only that tree finds it:
// a revert in the same checkout reuses it, another checkout never sees it.
//
// Blobs are numbered rather than named after the file, so an entry's paths
// stay short however deep the output tree is. The `v1` directory is the
// format: a new format gets a new directory, and the old one ages out.

import { createHash } from "node:crypto";
import path from "node:path";

export const ENTRY_FORMAT = 1;
const ENTRIES = `v${ENTRY_FORMAT}`;
const SHA256 = /^[0-9a-f]{64}$/u;

/** @param {string} storeDir */
export function entriesDirectory(storeDir) {
  return path.join(storeDir, ENTRIES);
}

/** The entry any checkout may restore. @param {string} storeDir @param {string} fingerprint */
export function entryDirectory(storeDir, fingerprint) {
  if (!SHA256.test(fingerprint)) throw new Error(`build-cache: "${fingerprint}" is not a sha256 fingerprint`);
  return path.join(entriesDirectory(storeDir), fingerprint);
}

/** The entry only the checkout at `repoRoot` may restore. @param {string} storeDir @param {string} fingerprint @param {string} repoRoot */
export function rootedEntryDirectory(storeDir, fingerprint, repoRoot) {
  if (!SHA256.test(fingerprint)) throw new Error(`build-cache: "${fingerprint}" is not a sha256 fingerprint`);
  return path.join(entriesDirectory(storeDir), createHash("sha256").update(`${fingerprint}\0${treeRoot(repoRoot)}`).digest("hex"));
}

/** A checkout's root as a rooted entry records it: resolved, forward slashes, lower case on Windows. @param {string} repoRoot */
export function treeRoot(repoRoot) {
  const forward = path.resolve(repoRoot).split(path.sep).join("/");
  return process.platform === "win32" ? forward.toLowerCase() : forward;
}

/** @param {string} storeDir */
export function temporaryDirectory(storeDir) {
  return path.join(storeDir, "tmp");
}
