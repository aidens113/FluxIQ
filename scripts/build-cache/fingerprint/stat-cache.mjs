// Content hashes of files, remembered by (size, mtime, inode) so an unchanged
// file is not read again -- and never trusted when it could have changed
// without its stat changing.
//
// The racy case is a file rewritten within the timestamp granularity of the
// moment it was hashed: same size, same mtime, different bytes. A cached hash
// is therefore reused only when size, mtime (nanoseconds) and inode all match
// AND the file's mtime is at least RACY_MARGIN_MS older than the moment that
// entry's hash was taken. A file modified after that moment has a newer mtime
// and misses; a file modified just before it misses by the margin and is read
// again. Two seconds covers the coarsest common timestamp (FAT's 2 s); NTFS and
// ext4 are far finer. This is git's racy-index rule.
//
// The cache is only a cache: a missing or unreadable file starts it empty, and
// losing a concurrent writer's entries costs a re-read, never a wrong hash.
//
// Every hash also records the modification time it saw, so a caller can ask
// for the newest input or output without a second stat (`digest-files.mjs`).

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const RACY_MARGIN_MS = 2000;
const FORMAT = 1;
const KEEP_UNUSED_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * @param {string | null} cacheFile where the cache persists; `null` keeps it in memory only
 * @param {{ now?: () => number }} [options] clock, overridden only by tests
 */
export async function openStatCache(cacheFile, options = {}) {
  const now = options.now ?? Date.now;
  const entries = cacheFile === null ? new Map() : await load(cacheFile);
  const inflight = new Map();
  const mtimes = new Map();
  const stats = { hits: 0, reads: 0 };

  async function hashOf(file) {
    const at = now();
    const current = await stat(file, { bigint: true });
    const id = key(file);
    const cached = entries.get(id);
    const mtimeMs = Number(current.mtimeNs / 1_000_000n);
    mtimes.set(id, mtimeMs);
    if (
      cached !== undefined &&
      cached[0] === String(current.size) &&
      cached[1] === String(current.mtimeNs) &&
      cached[2] === String(current.ino) &&
      mtimeMs <= cached[4] - RACY_MARGIN_MS
    ) {
      cached[5] = at;
      stats.hits += 1;
      return cached[3];
    }
    const hash = createHash("sha256").update(await readFile(file)).digest("hex");
    entries.set(id, [String(current.size), String(current.mtimeNs), String(current.ino), hash, at, at]);
    stats.reads += 1;
    return hash;
  }

  return {
    stats,
    /** @param {string} file absolute path @returns {Promise<string>} sha256 of the file's bytes */
    hash(file) {
      const id = key(file);
      if (!inflight.has(id)) inflight.set(id, hashOf(file).finally(() => inflight.delete(id)));
      return inflight.get(id);
    },
    /** The modification time (ms) seen when `file` was last hashed by this instance, or undefined. */
    mtimeMs(file) {
      return mtimes.get(key(file));
    },
    /** Persists the cache, merged over whatever a concurrent process wrote meanwhile. */
    async save() {
      if (cacheFile === null) return;
      const onDisk = await load(cacheFile);
      for (const [id, entry] of entries) {
        const other = onDisk.get(id);
        if (other === undefined || other[4] <= entry[4]) onDisk.set(id, entry);
      }
      const cutoff = now() - KEEP_UNUSED_MS;
      const kept = Object.fromEntries([...onDisk].filter(([, entry]) => entry[5] >= cutoff));
      await mkdir(path.dirname(cacheFile), { recursive: true });
      const temporary = `${cacheFile}.${process.pid}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify({ format: FORMAT, entries: kept }));
      try {
        await rename(temporary, cacheFile);
      } catch (error) {
        await rm(temporary, { force: true });
        // Windows refuses to replace a file another process has open. The
        // other writer's copy is as good as this one, so this one yields.
        if (error?.code !== "EPERM" && error?.code !== "EBUSY" && error?.code !== "EACCES") throw error;
      }
    }
  };
}

async function load(cacheFile) {
  let text;
  try {
    text = await readFile(cacheFile, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return new Map();
    throw error;
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    // A torn or foreign file is an empty cache, not a failed build: every
    // hash it could have supplied is recomputed from the file itself.
    if (error instanceof SyntaxError) return new Map();
    throw error;
  }
  if (parsed?.format !== FORMAT || typeof parsed.entries !== "object" || parsed.entries === null) return new Map();
  return new Map(Object.entries(parsed.entries).filter(([, entry]) => Array.isArray(entry) && entry.length === 6));
}

function key(file) {
  const resolved = path.resolve(file);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}
