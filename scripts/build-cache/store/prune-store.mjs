// Keeps the shared store bounded. Run after every write:
//   - an entry unused for 14 days is removed (an entry's `entry.json` mtime is
//     moved to now each time it is stored or restored);
//   - then, while the entries total more than 5 GB, the least recently used
//     is removed;
//   - an entry whose `entry.json` is missing or unparsable is removed: it was
//     half-deleted or is not ours;
//   - a temporary write directory older than an hour is removed: its writer
//     died before renaming it into place.
// A reader restoring an entry removed underneath it finds it incomplete,
// discards it and builds, so pruning never makes a build wrong.

import { readdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { entriesDirectory, temporaryDirectory } from "./entry-location.mjs";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_UNUSED_MS = 14 * DAY_MS;
const MAX_BYTES = 5 * 1024 ** 3;
const ABANDONED_WRITE_MS = 60 * 60 * 1000;

/**
 * @param {string} storeDir
 * @param {{ now?: number, maxBytes?: number, maxUnusedMs?: number }} [options]
 * @returns {Promise<{ kept: number, removed: number, bytes: number }>}
 */
export async function pruneStore(storeDir, options = {}) {
  const now = options.now ?? Date.now();
  const maxBytes = options.maxBytes ?? MAX_BYTES;
  const maxUnusedMs = options.maxUnusedMs ?? MAX_UNUSED_MS;
  let removed = 0;

  const entries = [];
  for (const name of await directoryNames(entriesDirectory(storeDir))) {
    const dir = path.join(entriesDirectory(storeDir), name);
    const described = await describe(dir);
    if (described === null || now - described.usedMs > maxUnusedMs) {
      await rm(dir, { recursive: true, force: true });
      removed += 1;
    } else {
      entries.push({ dir, ...described });
    }
  }
  entries.sort((left, right) => left.usedMs - right.usedMs);
  let bytes = entries.reduce((total, entry) => total + entry.bytes, 0);
  while (bytes > maxBytes && entries.length > 0) {
    const oldest = entries.shift();
    await rm(oldest.dir, { recursive: true, force: true });
    bytes -= oldest.bytes;
    removed += 1;
  }

  for (const name of await directoryNames(temporaryDirectory(storeDir))) {
    const dir = path.join(temporaryDirectory(storeDir), name);
    const stats = await stat(dir);
    if (now - stats.mtimeMs > ABANDONED_WRITE_MS) await rm(dir, { recursive: true, force: true });
  }
  return { kept: entries.length, removed, bytes };
}

async function directoryNames(dir) {
  try {
    return (await readdir(dir, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

/** An entry's size and last use, or `null` when it has no readable description. */
async function describe(dir) {
  const file = path.join(dir, "entry.json");
  try {
    const [text, stats] = await Promise.all([readFile(file, "utf8"), stat(file)]);
    const entry = JSON.parse(text);
    return { usedMs: stats.mtimeMs, bytes: Number(entry.bytes) || 0 };
  } catch (error) {
    if (error?.code === "ENOENT" || error instanceof SyntaxError) return null;
    throw error;
  }
}
