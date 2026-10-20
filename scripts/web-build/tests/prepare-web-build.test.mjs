// A keyed web build: built once per key under a create-only lock, published
// only after a build that succeeded and passed its checks, and never reused
// from a failed, interrupted, half-written or out-of-date attempt. Moved from
// the downstream web extension's Lab, which ran this logic until Core owned it.

import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { assertStampedRuntimeIdentity, markBuildComplete, newBuildAttemptName, prepareWebBuild, publishBuildAttempt } from "../index.mjs";

const KEY = "0123456789abcdef01234567";

async function write(file, text) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text);
}

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

/** A staged web directory as staging leaves it: its gateway artifact and receipt in place. */
async function fakeStage(_repoRoot, attemptDirectory) {
  const webDirectory = path.join(attemptDirectory, "apps", "web");
  await write(path.join(webDirectory, "package.json"), "{}\n");
  await write(path.join(webDirectory, ".server-runtime", "client-gateway-server.mjs"), "export {};\n");
  await write(path.join(webDirectory, ".server-runtime", "client-gateway-server.mjs.identity.json"), "{}\n");
  return { webDirectory };
}

/** What a build that resolved Core's stamped dist leaves. */
async function finishBuild(webDirectory, buildId) {
  await write(path.join(webDirectory, ".next", "BUILD_ID"), `${buildId}\n`);
  await write(path.join(webDirectory, ".next", "server", "app", "page.js"), 'const embedded = "{\\"schema\\":1}";\n');
}

async function harness(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "web-build-prepare-"));
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  const repoRoot = path.join(root, "core");
  const cacheRoot = path.join(root, "cache");
  const keyDirectory = path.join(cacheRoot, KEY);
  const builds = [];
  const order = [];
  const overrides = {
    ensureGateway: async () => {
      order.push("gateway");
      return "reused";
    },
    key: async () => {
      order.push("key");
      return { key: KEY, fingerprint: "f".repeat(64) };
    },
    stage: fakeStage,
    gatewayCopyMatches: async () => true,
    assertIdentity: assertStampedRuntimeIdentity,
    pathBudget: (cache) => ({ fits: true, root: cache.length, allowed: Number.MAX_SAFE_INTEGER, longest: cache.length, limit: 259 }),
    lock: { pollMs: 5 }
  };
  const run = async (command) => {
    builds.push(command);
    await delay(25);
    await finishBuild(command.cwd, `build-${builds.length}`);
  };
  const prepare = (options = {}, more = {}) => prepareWebBuild({ repoRoot, cacheRoot, env: { BASE: "kept" }, run, ...options }, { ...overrides, ...more });
  return { root, repoRoot, cacheRoot, keyDirectory, builds, order, prepare, lockPath: path.join(keyDirectory, "build.lock") };
}

const attemptNames = async (keyDirectory) => (await readdir(keyDirectory)).filter((name) => /^b-[0-9a-f]{12}$/u.test(name)).sort();

test("concurrent preparations build once, publish only after the build, and share the publication", async (t) => {
  const { keyDirectory, lockPath, builds, prepare } = await harness(t);
  let publishedDuringBuild;
  const results = await Promise.all(
    [1, 2, 3].map(() =>
      prepare({
        run: async (command) => {
          builds.push(command);
          await delay(40);
          publishedDuringBuild = await exists(path.join(keyDirectory, "published.json"));
          await finishBuild(command.cwd, "build-1");
        }
      })
    )
  );
  assert.equal(builds.length, 1, "three concurrent callers, one build");
  assert.equal(publishedDuringBuild, false, "nothing is published while the build runs");
  assert.equal(new Set(results.map((build) => build.directory)).size, 1, "every caller gets the same build");
  assert.deepEqual(results.map((build) => build.reused).sort(), [false, true, true], "only the builder reports a build");
  const build = results.find((candidate) => !candidate.reused);
  assert.equal(build.buildId, "build-1");
  assert.equal(build.webDirectory, path.join(build.directory, "apps", "web"));
  assert.deepEqual(JSON.parse(await readFile(path.join(keyDirectory, "published.json"), "utf8")), { schemaVersion: 1, key: KEY, attempt: path.basename(build.directory) });
  assert.deepEqual(JSON.parse(await readFile(path.join(build.directory, "build-complete.json"), "utf8")), { schemaVersion: 1, key: KEY, buildId: "build-1" });
  assert.equal(await exists(lockPath), false, "the lock is released");

  const later = await prepare();
  assert.equal(later.directory, build.directory, "a later caller reuses the publication");
  assert.equal(later.reused, true);
  assert.equal(builds.length, 1);
});

test("the gateway is made current before the key is taken, and the build runs next build in its attempt with an isolated FluxIQ root", async (t) => {
  const { repoRoot, keyDirectory, builds, order, prepare } = await harness(t);
  const build = await prepare();
  assert.deepEqual(order, ["gateway", "key", "key"], "gateway, key, then the key again after the build");
  const [command] = builds;
  assert.equal(command.name, "web-build");
  assert.equal(command.command, path.join(repoRoot, "apps", "web", "node_modules", ".bin", process.platform === "win32" ? "next.cmd" : "next"));
  assert.deepEqual(command.args, ["build", "--turbopack"]);
  assert.equal(command.cwd, path.join(build.directory, "apps", "web"));
  assert.equal(command.shell, process.platform === "win32");
  assert.equal(command.env.BASE, "kept", "the caller's environment is the base");
  assert.equal(command.env.FLUXIQ_ROOT, path.join(build.directory, "fluxiq-root"));
  assert.equal(command.env.FLUXIQ_DATA_DIR, path.join(build.directory, "fluxiq-root", ".fluxiq"));
  assert.equal(command.env.FLUXIQ_CLIENT_GATEWAY_ENABLED, "false");
  assert.equal(build.nextExecutable, command.command);
  assert.equal(path.dirname(build.directory), keyDirectory);
});

test("a failed build is not published, releases the lock, and the next preparation builds a fresh attempt", async (t) => {
  const { keyDirectory, lockPath, builds, prepare } = await harness(t);
  await assert.rejects(
    prepare({
      run: async (command) => {
        builds.push(command);
        // A build that fails late can still leave a BUILD_ID behind.
        await finishBuild(command.cwd, "failed-build");
        throw new Error("web-build exited unsuccessfully");
      }
    }),
    /web-build exited unsuccessfully/u
  );
  assert.equal(await exists(path.join(keyDirectory, "published.json")), false);
  assert.equal(await exists(lockPath), false);
  const failedAttempt = path.dirname(path.dirname(builds[0].cwd));
  const build = await prepare();
  assert.equal(builds.length, 2);
  assert.notEqual(build.directory, failedAttempt, "in an attempt of its own");
});

test("a build that exits cleanly without a build id is refused and not published", async (t) => {
  const { keyDirectory, prepare } = await harness(t);
  await assert.rejects(prepare({ run: async () => undefined }), (error) => error.kind === "build" && /left no build id/u.test(error.message));
  assert.equal(await exists(path.join(keyDirectory, "published.json")), false);
});

test("a build that embeds Core's unstamped runtime identity is refused, named, never marked complete, and the lock released", async (t) => {
  const { keyDirectory, lockPath, prepare } = await harness(t);
  await assert.rejects(
    prepare({
      run: async (command) => {
        await finishBuild(command.cwd, "source-build");
        await write(path.join(command.cwd, ".next", "server", "chunks", "core_service.js"), `JSON.parse('{"fluxiqRuntimeIdentityPlaceholder":302}')\n`);
      }
    }),
    (error) => error.kind === "build" && /fluxiqRuntimeIdentityPlaceholder in \.next\/server\/chunks\/core_service\.js/u.test(error.message) && /not published/u.test(error.message)
  );
  assert.equal(await exists(path.join(keyDirectory, "published.json")), false);
  const [attempt] = await attemptNames(keyDirectory);
  assert.equal(await exists(path.join(keyDirectory, attempt, "build-complete.json")), false);
  assert.equal(await exists(lockPath), false);
});

test("a build whose Core inputs changed while it ran is not published under the old key", async (t) => {
  const { keyDirectory, prepare } = await harness(t);
  let calls = 0;
  const key = async () => ({ key: (calls += 1) === 1 ? KEY : "ffffffffffffffffffffffff", fingerprint: "x" });
  await assert.rejects(prepare({}, { key }), (error) => error.kind === "build" && /inputs changed while the web panel was building/u.test(error.message));
  assert.equal(await exists(path.join(keyDirectory, "published.json")), false);
});

test("a staged gateway copy that differs from the checkout's stops the build before it runs", async (t) => {
  const { builds, prepare } = await harness(t);
  await assert.rejects(prepare({}, { gatewayCopyMatches: async () => false }), /staged gateway server artifact differs/u);
  assert.equal(builds.length, 0);
});

test("a published attempt is reused only while its gateway copy matches the checkout's", async (t) => {
  const { keyDirectory, builds, prepare } = await harness(t);
  const attempt = newBuildAttemptName();
  const directory = path.join(keyDirectory, attempt);
  const { webDirectory } = await fakeStage(null, directory);
  await finishBuild(webDirectory, "seeded");
  await markBuildComplete(directory, KEY, "seeded");
  await publishBuildAttempt(keyDirectory, KEY, attempt);
  const reused = await prepare();
  assert.deepEqual([reused.directory, reused.buildId, reused.reused, builds.length], [directory, "seeded", true, 0]);
  const lines = [];
  const rebuilt = await prepare({ log: (line) => lines.push(line) }, { gatewayCopyMatches: async (_root, web) => web !== webDirectory });
  assert.notEqual(rebuilt.directory, directory);
  assert.equal(builds.length, 1);
  assert.ok(lines.some((line) => /gateway artifact differs/u.test(line)), lines.join("\n"));
});

test("a lock left by a dead process is reclaimed", async (t) => {
  const { keyDirectory, lockPath, builds, prepare } = await harness(t);
  await write(lockPath, JSON.stringify({ pid: 424_242, token: "dead", startedAt: new Date(0).toISOString() }));
  const build = await prepare({}, { lock: { pollMs: 5, isAlive: (pid) => pid !== 424_242 } });
  assert.equal(builds.length, 1);
  assert.equal(await exists(lockPath), false);
  assert.deepEqual(await attemptNames(keyDirectory), [path.basename(build.directory)]);
});

test("waiting on a live builder is bounded, fails closed without building, and leaves the lock alone", { timeout: 5_000 }, async (t) => {
  const { lockPath, builds, prepare } = await harness(t);
  const record = JSON.stringify({ pid: 434_343, token: "live", startedAt: new Date().toISOString() });
  await write(lockPath, record);
  await assert.rejects(prepare({ waitTimeoutMs: 60 }, { lock: { pollMs: 5, isAlive: () => true } }), (error) => error.kind === "build" && /Timed out after 60 ms/u.test(error.message));
  assert.equal(builds.length, 0);
  assert.equal(await readFile(lockPath, "utf8"), record);
});

test("an aborted wait stops at once with the signal's reason", { timeout: 5_000 }, async (t) => {
  const { lockPath, builds, prepare } = await harness(t);
  await write(lockPath, JSON.stringify({ pid: 434_343, token: "live", startedAt: new Date().toISOString() }));
  const controller = new AbortController();
  setTimeout(() => controller.abort(new Error("run cancelled")), 30);
  await assert.rejects(prepare({ signal: controller.signal }, { lock: { pollMs: 5, isAlive: () => true } }), /run cancelled/u);
  assert.equal(builds.length, 0);
});

test("a cache root inside node_modules is refused before Core is read, and says why", async (t) => {
  const { root, order, builds, prepare } = await harness(t);
  await assert.rejects(
    prepare({ cacheRoot: path.join(root, "node_modules", "cwb") }),
    (error) => error.kind === "environment" && /inside a node_modules directory/u.test(error.message) && /exit 3221225501/u.test(error.message)
  );
  assert.deepEqual([order, builds.length], [[], 0]);
  await assert.rejects(stat(path.join(root, "node_modules")), { code: "ENOENT" });
});

test("a cache root too long for Windows is refused with the numbers", async (t) => {
  const { order, prepare } = await harness(t);
  await assert.rejects(
    prepare({}, { pathBudget: () => ({ fits: false, root: 82, allowed: 80, longest: 261, limit: 259 }) }),
    (error) => error.kind === "environment" && /82 characters/u.test(error.message) && /needs 261, over the 259-character limit/u.test(error.message) && /at most 80 characters/u.test(error.message)
  );
  assert.deepEqual(order, []);
});

test("a cache root on another drive than the Core is refused", { skip: process.platform !== "win32" && "drive letters exist only on Windows" }, async (t) => {
  const { repoRoot, order, prepare } = await harness(t);
  const otherDrive = path.parse(repoRoot).root.toUpperCase().startsWith("C") ? "D:\\cache" : "C:\\cache";
  await assert.rejects(prepare({ cacheRoot: otherDrive }), (error) => error.kind === "environment" && /another filesystem root/u.test(error.message));
  assert.deepEqual(order, []);
});
