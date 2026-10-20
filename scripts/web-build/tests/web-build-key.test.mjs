// The key against this checkout: Core's own web:build fingerprint plus the
// staged layout, stable while nothing changes, different when a fingerprinted
// setting does; and the dry run reports it without creating anything.

import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { decideStep, REPOSITORY_ROOT } from "../../build-cache/index.mjs";
import { inspectWebBuild, markBuildComplete, newBuildAttemptName, publishBuildAttempt, webBuildKey } from "../index.mjs";

test("the key is 24 hex characters over web:build's fingerprint, stable, and follows a fingerprinted variable", async () => {
  const first = await webBuildKey(REPOSITORY_ROOT, { env: {} });
  const second = await webBuildKey(REPOSITORY_ROOT, { env: {} });
  assert.match(first.key, /^[0-9a-f]{24}$/u);
  assert.deepEqual(second, first);
  assert.equal(first.fingerprint, (await decideStep("web:build", { env: {} })).fingerprint, "the build cache's own web:build fingerprint");
  const other = await webBuildKey(REPOSITORY_ROOT, { env: { NEXT_PUBLIC_EXAMPLE: "1" } });
  assert.notEqual(other.key, first.key, "NEXT_* reaches the bundle, so it reaches the key");
});

test("the dry run reports the key and whether it is published, and creates nothing", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "web-build-inspect-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const cacheRoot = path.join(root, "cache");
  const { key } = await webBuildKey(REPOSITORY_ROOT, { env: {} });
  assert.deepEqual(await inspectWebBuild({ cacheRoot, env: {} }), { key, cached: false });
  assert.deepEqual(await readdir(root), [], "no cache directory, lock or build");

  const keyDirectory = path.join(cacheRoot, key);
  const attempt = newBuildAttemptName();
  const web = path.join(keyDirectory, attempt, "apps", "web");
  for (const [file, text] of [[".next/BUILD_ID", "stub\n"], [".server-runtime/client-gateway-server.mjs", "export {};\n"], [".server-runtime/client-gateway-server.mjs.identity.json", "{}\n"]]) {
    await mkdir(path.dirname(path.join(web, file)), { recursive: true });
    await writeFile(path.join(web, file), text);
  }
  await markBuildComplete(path.join(keyDirectory, attempt), key, "stub");
  await publishBuildAttempt(keyDirectory, key, attempt);
  assert.deepEqual(await inspectWebBuild({ cacheRoot, env: {} }), { key, cached: true });
});
