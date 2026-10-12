import { readFileSync, statSync } from "node:fs";
import path from "node:path";

type Resolved = { dir: string; configPath: string; stamp: string; config: unknown };

const CACHE_LIMIT = 1024;
const resolved = new Map<string, Resolved>();

/**
 * The storage root that owns `startDir`: the nearest directory at or above it
 * holding a `config.json`, with that config parsed. `null` when no directory
 * above has one. A config that cannot be read or parsed throws, as reading it
 * always did.
 *
 * A resolution is kept per starting directory, so the many reads of one
 * store's documents walk the tree and parse the config once (t435: a required
 * run resolved the same root 86 times). It is used again only while that
 * `config.json` is the same file, unchanged: its device, inode, size and
 * modification time are checked on every use, so a config rewritten, replaced
 * or removed is walked to again. Only the location and the config are kept,
 * never a document.
 *
 * Not seen: a `config.json` created later in a directory between `startDir`
 * and the kept root. A storage root is laid out before its stores are used,
 * and never nested inside another one.
 */
export function programStateRoot(startDir: string): { dir: string; config: unknown } | null {
  const kept = resolved.get(startDir);
  if (kept && configStamp(kept.configPath) === kept.stamp) return { dir: kept.dir, config: kept.config };
  resolved.delete(startDir);
  let current = startDir;
  while (true) {
    const configPath = path.join(current, "config.json");
    const stamp = configStamp(configPath);
    if (stamp) {
      const config: unknown = JSON.parse(readFileSync(configPath, "utf8"));
      // Kept only when nothing rewrote the config while it was read.
      if (configStamp(configPath) === stamp) remember(startDir, { dir: current, configPath, stamp, config });
      return { dir: current, config };
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function remember(startDir: string, entry: Resolved): void {
  if (resolved.size >= CACHE_LIMIT) resolved.delete(resolved.keys().next().value!);
  resolved.set(startDir, entry);
}

/** Which file is at `configPath`, and in what state: device, inode, size and modification time; `undefined` when nothing is there. */
function configStamp(configPath: string): string | undefined {
  const info = statSync(configPath, { bigint: true, throwIfNoEntry: false });
  return info ? `${info.dev}:${info.ino}:${info.size}:${info.mtimeNs}` : undefined;
}
