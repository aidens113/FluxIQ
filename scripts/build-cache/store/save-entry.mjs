// Puts a step's just-stamped result into the shared store, so a checkout
// whose inputs fingerprint the same restores it instead of building.
//
// A build stores its output files; a check has none, so its entry is the
// record that it passed, with the output it printed when the step replays it
// (the structure audit). The fingerprint is path-independent -- every label
// is relative to the checkout, and an environment value that is an absolute
// path is fingerprinted relative to it (`resolve-step.mjs`) -- so the same
// inputs in two checkouts give the same key.
//
// An output under a path outside the tree is refused. An output file holding
// the tree's absolute path, in any spelling (`path-spellings.mjs`), would point
// back at this tree from wherever it was restored, so such a result is stored
// under this tree's rooted key (`entry-location.mjs`) and only this tree can
// restore it: a revert here reuses it, and no other checkout ever sees it.
//
// The write is atomic: the entry is assembled in `tmp/` and renamed into
// place, so a reader sees a whole entry or none. An entry already stored
// under the key with the same output digest is kept and marked used; one with
// a different digest (a forced rebuild that came out differently) is replaced.
//
// entry.json: { format, step, kind, fingerprint, outputDigest, root, output,
//               bytes, storedAt, files: [{ output, relative, size, sha256 }] }
// `root` is null for a relocatable entry and the tree's root for a rooted one.

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import { ENTRY_FORMAT, entryDirectory, rootedEntryDirectory, temporaryDirectory, treeRoot } from "./entry-location.mjs";
import { findEmbeddedPath } from "./find-embedded-path.mjs";
import { listOutputFiles } from "./list-output-files.mjs";
import { pathSpellings } from "./path-spellings.mjs";
import { pruneStore } from "./prune-store.mjs";
import { readEntry } from "./read-entry.mjs";

/**
 * @param {string} storeDir
 * @param {{ name: string, kind: string, repoRoot: string, outputs: { label: string, path: string, exclude: string[], match: RegExp | null }[], relocationRoots: string[] }} resolved
 * @param {{ fingerprint: string, outputDigest: string, output?: string | null }} result
 * @returns {Promise<{ stored: boolean, reason: string }>}
 */
export async function saveEntry(storeDir, resolved, result) {
  const outside = resolved.outputs.find((output) => output.label === ".." || output.label.startsWith("../"));
  if (outside !== undefined) return { stored: false, reason: `not stored: output ${outside.label} is outside the tree` };

  const files = await listOutputFiles(resolved);
  const embedded = await findEmbeddedPath(
    files.map((file) => file.path),
    pathSpellings(resolved.relocationRoots)
  );
  const rooted = embedded !== null;
  const final = rooted ? rootedEntryDirectory(storeDir, result.fingerprint, resolved.repoRoot) : entryDirectory(storeDir, result.fingerprint);
  const scope = rooted
    ? `for this tree only, because ${path.relative(resolved.repoRoot, embedded.file).split(path.sep).join("/")} holds its absolute path (${embedded.spelling}) and is not relocatable`
    : "";

  const existing = await readEntry(final);
  if (existing !== null && existing.outputDigest === result.outputDigest) {
    const now = new Date();
    await utimes(path.join(final, "entry.json"), now, now);
    return { stored: true, reason: `already in the shared store${scope === "" ? "" : ` ${scope}`}` };
  }

  const temporary = path.join(temporaryDirectory(storeDir), `${process.pid}-${randomUUID()}`);
  await mkdir(path.join(temporary, "files"), { recursive: true });
  try {
    const described = [];
    let bytes = 0;
    for (const [index, file] of files.entries()) {
      const content = await readFile(file.path);
      await writeFile(path.join(temporary, "files", String(index)), content);
      bytes += content.length;
      described.push({ output: file.output, relative: file.relative, size: content.length, sha256: createHash("sha256").update(content).digest("hex") });
    }
    const entry = {
      format: ENTRY_FORMAT,
      step: resolved.name,
      kind: resolved.kind,
      fingerprint: result.fingerprint,
      outputDigest: result.outputDigest,
      root: rooted ? treeRoot(resolved.repoRoot) : null,
      output: result.output ?? null,
      bytes,
      storedAt: new Date().toISOString(),
      files: described
    };
    await writeFile(path.join(temporary, "entry.json"), `${JSON.stringify(entry)}\n`);
    await mkdir(path.dirname(final), { recursive: true });
    // Absent, damaged or holding a different result: whatever is there goes.
    await rm(final, { recursive: true, force: true });
    const placed = await renameInto(temporary, final);
    const pruned = await pruneStore(storeDir);
    const note = pruned.removed > 0 ? `, pruned ${pruned.removed} old entr${pruned.removed === 1 ? "y" : "ies"}` : "";
    const verb = placed ? "stored in the shared store" : "already in the shared store";
    return { stored: true, reason: `${verb}${scope === "" ? "" : ` ${scope}`} (${files.length} file(s), ${bytes} bytes${note})` };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

/** Renames the assembled entry into place; `false` when another writer placed the same key first. */
async function renameInto(temporary, final) {
  try {
    await rename(temporary, final);
    return true;
  } catch (error) {
    if (["EEXIST", "ENOTEMPTY", "EPERM", "EBUSY"].includes(error?.code) && (await readEntry(final)) !== null) return false;
    throw error;
  }
}
