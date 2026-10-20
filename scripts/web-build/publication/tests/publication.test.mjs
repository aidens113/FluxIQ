// A keyed build is reusable only when its publication, its completion marker,
// its BUILD_ID and its gateway artifact all agree.

import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { markBuildComplete, newBuildAttemptName, publishBuildAttempt, readBuildId, readPublishedBuild, RECORDS } from "../index.mjs";

const KEY = "a".repeat(24);
const OTHER_KEY = "f".repeat(24);

async function keyDirectory(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "web-build-publication-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return path.join(root, KEY);
}

async function write(file, text) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text);
}

/** An attempt as a finished build leaves it, before any record. */
async function seedAttempt(directory, { buildId = "seeded", gateway = true } = {}) {
  const web = path.join(directory, "apps", "web");
  await write(path.join(web, ".next", "BUILD_ID"), `${buildId}\n`);
  if (gateway) {
    await write(path.join(web, ".server-runtime", "client-gateway-server.mjs"), "export {};\n");
    await write(path.join(web, ".server-runtime", "client-gateway-server.mjs.identity.json"), "{}\n");
  }
  return web;
}

test("attempt names are fresh, short and accepted by publication; a malformed one is refused", async (t) => {
  const names = new Set(Array.from({ length: 20 }, () => newBuildAttemptName()));
  assert.equal(names.size, 20);
  for (const name of names) assert.match(name, RECORDS.attemptName);
  const keyDir = await keyDirectory(t);
  await mkdir(keyDir, { recursive: true });
  await assert.rejects(publishBuildAttempt(keyDir, KEY, "../escape"), /malformed web build attempt name/u);
});

test("a fully published attempt is read back, and the records are whole files with no temporary left", async (t) => {
  const keyDir = await keyDirectory(t);
  const attempt = newBuildAttemptName();
  const directory = path.join(keyDir, attempt);
  const web = await seedAttempt(directory);
  await markBuildComplete(directory, KEY, "seeded");
  await publishBuildAttempt(keyDir, KEY, attempt);
  assert.deepEqual(await readPublishedBuild(keyDir, KEY), { key: KEY, directory, webDirectory: web, buildId: "seeded" });
  assert.deepEqual(JSON.parse(await readFile(path.join(keyDir, "published.json"), "utf8")), { schemaVersion: 1, key: KEY, attempt });
  assert.deepEqual(JSON.parse(await readFile(path.join(directory, "build-complete.json"), "utf8")), { schemaVersion: 1, key: KEY, buildId: "seeded" });
  assert.deepEqual((await readdir(keyDir)).filter((name) => name.endsWith(".tmp")), []);
});

test("nothing short of full agreement is reused", async (t) => {
  const cases = [
    ["a completed attempt that was never published", { marker: KEY }],
    ["a published attempt with no completion marker", { published: KEY }],
    ["a published attempt whose marker names another key", { marker: OTHER_KEY, published: KEY }],
    ["a published attempt whose marker disagrees with BUILD_ID", { marker: KEY, markerBuildId: "another-build", published: KEY }],
    ["an attempt published under another key", { marker: KEY, published: OTHER_KEY }],
    ["a published attempt without its gateway artifact", { marker: KEY, published: KEY, gateway: false }]
  ];
  for (const [name, seed] of cases) {
    const keyDir = await keyDirectory(t);
    const attempt = newBuildAttemptName();
    const directory = path.join(keyDir, attempt);
    await seedAttempt(directory, { gateway: seed.gateway !== false });
    if (seed.marker) await markBuildComplete(directory, seed.marker, seed.markerBuildId ?? "seeded");
    if (seed.published) await publishBuildAttempt(keyDir, seed.published, attempt);
    assert.equal(await readPublishedBuild(keyDir, KEY), undefined, name);
  }
});

test("a damaged or foreign record is no record", async (t) => {
  const keyDir = await keyDirectory(t);
  const attempt = newBuildAttemptName();
  const directory = path.join(keyDir, attempt);
  await seedAttempt(directory);
  await markBuildComplete(directory, KEY, "seeded");
  for (const text of ["{", "[]", JSON.stringify({ schemaVersion: 2, key: KEY, attempt }), JSON.stringify({ schemaVersion: 1, key: KEY, attempt, extra: true }), ""]) {
    await writeFile(path.join(keyDir, "published.json"), text);
    assert.equal(await readPublishedBuild(keyDir, KEY), undefined, text);
  }
});

test("a build id is one well-formed line", async (t) => {
  const keyDir = await keyDirectory(t);
  const web = path.join(keyDir, "web");
  assert.equal(await readBuildId(web), undefined, "absent");
  await write(path.join(web, ".next", "BUILD_ID"), "  abc_DEF-123 \n");
  assert.equal(await readBuildId(web), "abc_DEF-123");
  await write(path.join(web, ".next", "BUILD_ID"), "has space\n");
  assert.equal(await readBuildId(web), undefined);
});
