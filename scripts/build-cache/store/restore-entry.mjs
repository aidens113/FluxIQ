// Restores a step's result from the shared store instead of building it.
//
// The entry is the relocatable one stored under the step's current
// fingerprint, or failing that the one this tree stored under its rooted key
// (`entry-location.mjs`). Restoring makes the step's outputs exactly the
// stored files:
//   - an output file the entry does not hold is removed;
//   - a stored file already on disk with the stored sha256 is left as it is,
//     timestamp included, so reverting one source file of a package rewrites
//     the few outputs it changed and not the thousands it did not;
//   - every other stored file is copied in and its modification time set to
//     now, as a build would have written it.
// Removals and copies run COPY_CONCURRENCY at a time: a fresh worktree
// restores fluxiq's 4,149 files, and one at a time that took about 44 s.
// Then it requires that
//   - the outputs, digested again from disk, equal the stored output digest;
//   - every required output exists.
// Only then is the local stamp written, so the next run in this tree is an
// ordinary reuse. Anything else -- an entry for another step or tree, a
// missing or altered blob, a digest that does not match -- discards the
// entry, removes the outputs and answers "not restored", and the caller
// builds. A check's entry has no files: restoring it is writing the stamp that
// says these exact inputs passed, with the output it printed.

import { existsSync } from "node:fs";
import { copyFile, mkdir, rm, utimes } from "node:fs/promises";
import path from "node:path";
import { outputState } from "../fingerprint/index.mjs";
import { forEachLimited } from "../for-each-limited.mjs";
import { STAMP_VERSION, writeStamp } from "../stamp/index.mjs";
import { ENTRY_FORMAT, entryDirectory, rootedEntryDirectory, treeRoot } from "./entry-location.mjs";
import { listOutputFiles } from "./list-output-files.mjs";
import { readEntry } from "./read-entry.mjs";

const COPY_CONCURRENCY = 16;

/**
 * @param {string} storeDir
 * @param {{ name: string, repoRoot: string, outputs: { label: string, path: string, exclude: string[], match: RegExp | null }[], required: string[], stampPath: string }} resolved
 * @param {{ fingerprint: string, roots: Record<string, string> }} decision
 * @param {{ hash(file: string): Promise<string>, mtimeMs(file: string): number | undefined }} statCache
 * @returns {Promise<{ restored: boolean, reason: string | null, rooted: boolean, output: string | null, copied: number, newestOutput: { ms: number, path: string | null } | null }>}
 *   `reason` is null when the store simply has no entry
 */
export async function restoreEntry(storeDir, resolved, decision, statCache) {
  let dir = null;
  let entry = null;
  for (const candidate of [entryDirectory(storeDir, decision.fingerprint), rootedEntryDirectory(storeDir, decision.fingerprint, resolved.repoRoot)]) {
    entry = await readEntry(candidate);
    if (entry !== null) {
      dir = candidate;
      break;
    }
    if (existsSync(candidate)) return discard(candidate, resolved, "its description is missing or unreadable");
  }
  if (entry === null) return { restored: false, reason: null, rooted: false, output: null, copied: 0, newestOutput: null };

  const rooted = entry.root !== null && entry.root !== undefined;
  if (entry.format !== ENTRY_FORMAT || entry.fingerprint !== decision.fingerprint || entry.step !== resolved.name || !Array.isArray(entry.files)) {
    return discard(dir, resolved, `it does not describe ${resolved.name} at this fingerprint`);
  }
  if (rooted && entry.root !== treeRoot(resolved.repoRoot)) return discard(dir, resolved, `it was stored for the tree at ${entry.root}`);
  const outputs = new Map(resolved.outputs.map((output) => [output.label, output]));
  const unknown = entry.files.find((file) => !outputs.has(file.output));
  if (unknown !== undefined) return discard(dir, resolved, `it holds a file of ${unknown.output}, which is not an output of this step`);

  const wanted = new Map(entry.files.map((file, index) => [key(targetOf(outputs.get(file.output), file.relative)), { ...file, index }]));
  const extra = (await listOutputFiles(resolved)).filter((present) => !wanted.has(key(present.path)));
  await forEachLimited(extra, COPY_CONCURRENCY, (present) => rm(present.path, { force: true }));
  const now = new Date();
  let copied = 0;
  let lostBlob = null;
  await forEachLimited([...wanted.values()], COPY_CONCURRENCY, async (file) => {
    const target = targetOf(outputs.get(file.output), file.relative);
    if (typeof file.sha256 === "string" && existsSync(target) && (await statCache.hash(target)) === file.sha256) return;
    await mkdir(path.dirname(target), { recursive: true });
    try {
      await copyFile(path.join(dir, "files", String(file.index)), target);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      // The lowest-numbered missing blob is named, whatever order the copies finished in.
      if (lostBlob === null || file.index < lostBlob.index) lostBlob = file;
      return;
    }
    await utimes(target, now, now);
    copied += 1;
  });
  if (lostBlob !== null) return discard(dir, resolved, `blob ${lostBlob.index} (${lostBlob.output}/${lostBlob.relative}) is missing`);

  const state = await outputState(resolved, statCache);
  if (state.digest !== entry.outputDigest) return discard(dir, resolved, `the restored outputs digest to ${state.digest.slice(0, 12)}, not the stored ${String(entry.outputDigest).slice(0, 12)}`);
  const missing = resolved.required.find((file) => !existsSync(file));
  if (missing !== undefined) return discard(dir, resolved, `it lacks the required ${path.relative(resolved.repoRoot, missing).split(path.sep).join("/")}`);

  const output = typeof entry.output === "string" ? entry.output : null;
  await writeStamp(resolved.stampPath, { version: STAMP_VERSION, step: resolved.name, fingerprint: decision.fingerprint, outputDigest: state.digest, roots: decision.roots, output });
  await utimes(path.join(dir, "entry.json"), now, now);
  return { restored: true, reason: null, rooted, output, copied, newestOutput: { ms: state.newestMs, path: state.newestPath } };
}

function targetOf(output, relative) {
  return relative === "" ? output.path : path.join(output.path, ...relative.split("/"));
}

function key(target) {
  const resolved = path.resolve(target);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

async function removeOutputs(resolved) {
  for (const file of await listOutputFiles(resolved)) await rm(file.path, { force: true });
}

/** Deletes a bad entry and the step's outputs, so the build that follows starts from nothing stale. */
async function discard(dir, resolved, why) {
  await removeOutputs(resolved);
  await rm(dir, { recursive: true, force: true });
  return { restored: false, reason: `store entry discarded, because ${why}`, rooted: false, output: null, copied: 0, newestOutput: null };
}
