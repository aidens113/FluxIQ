import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { openStatCache } from "../index.mjs";

let scratch;
beforeEach(async () => { scratch = await mkdtemp(path.join(os.tmpdir(), "core-cache-stat-")); });
afterEach(async () => { await rm(scratch, { recursive: true, force: true }); });

const sha = (text) => createHash("sha256").update(text).digest("hex");

async function oldFile(name, text, ageMs = 60_000) {
  const file = path.join(scratch, name);
  await writeFile(file, text);
  const then = new Date(Date.now() - ageMs);
  await utimes(file, then, then);
  return file;
}

test("an unchanged file older than the racy margin is hashed once", async () => {
  const file = await oldFile("a.txt", "alpha");
  const cache = await openStatCache(null);
  assert.equal(await cache.hash(file), sha("alpha"));
  assert.equal(await cache.hash(file), sha("alpha"));
  assert.deepEqual(cache.stats, { hits: 1, reads: 1 });
});

test("a file modified within the racy margin of its hash is read again every time", async () => {
  const file = path.join(scratch, "fresh.txt");
  await writeFile(file, "fresh");
  const cache = await openStatCache(null);
  await cache.hash(file);
  await cache.hash(file);
  assert.equal(cache.stats.reads, 2);
  assert.equal(cache.stats.hits, 0);
});

test("a same-size rewrite inside the margin is seen even though size and inode match", async () => {
  const file = path.join(scratch, "racy.txt");
  await writeFile(file, "one");
  const cache = await openStatCache(null);
  assert.equal(await cache.hash(file), sha("one"));
  await writeFile(file, "two");
  assert.equal(await cache.hash(file), sha("two"));
});

test("a changed size or mtime misses the cache", async () => {
  const file = await oldFile("b.txt", "beta");
  const cache = await openStatCache(null);
  await cache.hash(file);
  await writeFile(file, "beta, longer");
  const later = new Date(Date.now() - 30_000);
  await utimes(file, later, later);
  assert.equal(await cache.hash(file), sha("beta, longer"));
  assert.equal(cache.stats.reads, 2);
});

test("each hash records the modification time it saw", async () => {
  const file = await oldFile("m.txt", "mu", 90_000);
  const cache = await openStatCache(null);
  assert.equal(cache.mtimeMs(file), undefined);
  await cache.hash(file);
  const seen = cache.mtimeMs(file);
  assert.ok(Math.abs(seen - (Date.now() - 90_000)) < 5_000, String(seen));
});

test("saved entries are reused by the next process, and a torn cache file starts empty", async () => {
  const file = await oldFile("c.txt", "gamma");
  const cacheFile = path.join(scratch, "cache", "stat-cache.json");
  const first = await openStatCache(cacheFile);
  await first.hash(file);
  await first.save();
  const second = await openStatCache(cacheFile);
  assert.equal(await second.hash(file), sha("gamma"));
  assert.deepEqual(second.stats, { hits: 1, reads: 0 });

  await writeFile(cacheFile, "{\"format\":1,\"entr");
  const third = await openStatCache(cacheFile);
  assert.equal(await third.hash(file), sha("gamma"));
  assert.deepEqual(third.stats, { hits: 0, reads: 1 });
});
