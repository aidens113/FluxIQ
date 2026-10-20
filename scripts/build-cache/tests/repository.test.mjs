// The engine bound to a repository other than Core's: what a downstream
// repository relies on when it imports the engine and keeps only its
// configuration. Its store part is its own, a root in another checkout is
// labelled where it sits in that checkout, the CLI and the coverage proof run
// its registry, and its build order follows its workspace.

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { buildCacheFor, CORE_REPOSITORY, listRootFiles, pruneStore, resolveFor, resolveStep, runStep, storeDirectory } from "../index.mjs";
import { makeScratchWorkspace, putFile, runsIn, SCRATCH_STEPS } from "./scratch-workspace.mjs";

let base;
let first;
let second;
let store;
beforeEach(async () => {
  base = await mkdtemp(path.join(os.tmpdir(), "core-cache-repository-"));
  first = await makeScratchWorkspace("core-cache-repo-one-");
  second = await makeScratchWorkspace("core-cache-repo-two-");
  store = path.join(base, "store");
});
afterEach(async () => {
  for (const dir of [base, first, second]) await rm(dir, { recursive: true, force: true });
});

/** A downstream-shaped repository over a scratch checkout: Core's resolver, the store's top. */
function downstream(root, extra = {}) {
  return { name: "downstream", root, steps: SCRATCH_STEPS, resolveStep, storeNamespace: null, ...extra };
}

const quiet = (repo) => ({ stdio: "ignore", env: { ...process.env, RUN_LOG: path.join(repo, "runs.log"), FLUXIQ_BUILD_FORCE: "", FLUXIQ_BUILD_CACHE_DIR: store } });

async function entriesUnder(dir) {
  return existsSync(dir) ? readdir(dir) : [];
}

test("a downstream repository's entries live at the store's top, Core's under core/, and neither restores the other's", async () => {
  const cache = buildCacheFor(downstream(first));
  assert.equal(cache.storeDirectory({ FLUXIQ_BUILD_CACHE_DIR: store }), store);
  assert.equal(storeDirectory({ FLUXIQ_BUILD_CACHE_DIR: store }), path.join(store, "core"));

  assert.equal((await cache.runStep("contracts:build", quiet(first))).result, "build");
  assert.equal((await entriesUnder(path.join(store, "v1"))).length, 1);
  assert.deepEqual(await entriesUnder(path.join(store, "core", "v1")), []);

  // The same inputs fingerprint the same under either repository; only the
  // namespace keeps Core from restoring the downstream entry.
  const core = await runStep("contracts:build", { repoRoot: second, steps: SCRATCH_STEPS, ...quiet(second) });
  assert.deepEqual([core.result, core.source], ["build", "command"]);
  assert.equal((await entriesUnder(path.join(store, "core", "v1"))).length, 1);
  assert.deepEqual(await runsIn(second), ["contracts"]);
});

test("pruning the store's top never reaches into core/", async () => {
  const cache = buildCacheFor(downstream(first));
  await cache.runStep("contracts:build", quiet(first));
  await runStep("contracts:build", { repoRoot: second, steps: SCRATCH_STEPS, ...quiet(second) });
  const pruned = await pruneStore(store, { maxBytes: 0 });
  assert.equal(pruned.removed, 1);
  assert.deepEqual(await entriesUnder(path.join(store, "v1")), []);
  assert.equal((await entriesUnder(path.join(store, "core", "v1"))).length, 1);
});

test("a namespace that would land inside the store's own layout is refused", () => {
  for (const namespace of ["tmp", "v1", "v12", "a/b", "..", "", "Core"]) {
    assert.throws(() => storeDirectory({ FLUXIQ_BUILD_CACHE_DIR: store }, namespace), /store namespace/u, JSON.stringify(namespace));
  }
  assert.throws(() => buildCacheFor(downstream(first, { storeNamespace: "v1" })), /cannot be used as a build-cache repository: .*store namespace/u);
  assert.throws(() => buildCacheFor({ name: "broken", root: "relative", steps: SCRATCH_STEPS, storeNamespace: null }), /root is not an absolute path; resolveStep is not a function/u);
});

test("a walk root with a labelBase is labelled where it sits in its own tree, so two checkouts label it the same", async () => {
  await putFile(base, "one/core/packages/lib/src/index.ts", "export const lib = 1;\n");
  await putFile(base, "two/elsewhere/core/packages/lib/src/index.ts", "export const lib = 1;\n");
  const listed = async (repoRoot, dir) => listRootFiles({ kind: "walk", label: "core:packages/lib/src", labelBase: "core:packages/lib/src", path: dir }, { repoRoot, gitFiles: async () => [] });
  const one = await listed(path.join(base, "one", "ext"), path.join(base, "one", "core", "packages", "lib", "src"));
  const two = await listed(path.join(base, "two", "ext"), path.join(base, "two", "elsewhere", "core", "packages", "lib", "src"));
  assert.deepEqual(one.map((file) => file.label), ["core:packages/lib/src/index.ts"]);
  assert.deepEqual(two.map((file) => file.label), one.map((file) => file.label));
  const single = await listRootFiles({ kind: "walk", label: "core:package.json", labelBase: "core:package.json", path: path.join(base, "one", "core", "packages", "lib", "src", "index.ts") }, { repoRoot: base, gitFiles: async () => [] });
  assert.deepEqual(single.map((file) => file.label), ["core:package.json"]);
  // Without one, a walked file keeps its path in the repository.
  const plain = await listRootFiles({ kind: "walk", label: "one", path: path.join(base, "one", "core") }, { repoRoot: base, gitFiles: async () => [] });
  assert.deepEqual(plain.map((file) => file.label), ["one/core/packages/lib/src/index.ts"]);
});

test("a step resolves through the repository's own resolver and root; a resolved step passes through", () => {
  const seen = [];
  const repository = downstream(first, {
    resolveStep: (name, options) => {
      seen.push([name, options.repoRoot, options.steps === SCRATCH_STEPS]);
      return resolveStep(name, options);
    }
  });
  const resolved = resolveFor("fluxiq:build", { repository });
  assert.deepEqual(seen, [["fluxiq:build", first, true]]);
  assert.equal(resolveFor(resolved, { repository }), resolved);
  assert.equal(buildCacheFor(repository).resolveStep("fluxiq:build", { repoRoot: second }).repoRoot, second);
  assert.equal(CORE_REPOSITORY.storeNamespace, "core");
});

test("the CLI runs the bound repository's registry and prints one JSON line per step", async () => {
  const cache = buildCacheFor(downstream(first));
  const io = () => {
    const lines = { out: "", err: "" };
    return { lines, stdout: { write: (text) => (lines.out += text) }, stderr: { write: (text) => (lines.err += text) } };
  };
  const usage = io();
  assert.equal(await cache.runCli([], usage), 2);
  assert.match(usage.lines.err, /Registered steps: contracts:build, fluxiq:build/u);
  const unknown = io();
  assert.equal(await cache.runCli(["nope:build"], unknown), 2);
  assert.match(unknown.lines.err, /unknown step "nope:build"/u);
  const mismatch = io();
  assert.equal(await cache.runCli(["contracts:build", "--", "node", "other.mjs"], mismatch), 2);
  assert.match(mismatch.lines.err, /is not the registered one/u);

  const env = quiet(first).env;
  const ran = io();
  assert.equal(await cache.runCli(["contracts:build", "--", "node", "build.mjs"], { ...ran, env }), 0);
  const again = io();
  assert.equal(await cache.runCli(["contracts:build"], { ...again, env }), 0);
  assert.deepEqual(
    [ran.lines.out, again.lines.out].map((text) => {
      const line = JSON.parse(text.trim());
      return [Object.keys(line).join(","), line["build-cache"], line.step];
    }),
    [
      ["build-cache,step,reason,ms,source", "build", "contracts:build"],
      ["build-cache,step,reason,ms,source", "reuse", "contracts:build"]
    ]
  );
});

test("buildOrder follows the bound repository's workspace, dependencies first", () => {
  const cache = buildCacheFor(downstream(first));
  assert.deepEqual(cache.buildOrder("web:build"), ["contracts:build", "fluxiq:build", "web:build"]);
  assert.deepEqual(cache.buildOrder("client-gateway-websocket:build"), ["contracts:build", "client-gateway-websocket:build"]);
  assert.throws(() => cache.buildOrder("fluxiq:check"), /not a registered build step/u);
});

test("the coverage proof holds a repository's own listings against the inputs, counting its other install roots", async () => {
  await putFile(first, "packages/fluxiq/src/extra.txt", "read by the tool\n");
  await putFile(base, "linked/node_modules/dep/index.js", "installed elsewhere\n");
  await putFile(base, "stray/file.js", "read but no input\n");
  const listings = (files) => async (resolved) => (resolved.name === "fluxiq:check" ? [{ project: "tool", files }] : []);
  const withInstallRoots = (repository) => ({
    ...repository,
    resolveStep: (name, options) => ({ ...resolveStep(name, options), installRoots: [first, path.join(base, "linked")] })
  });
  const sink = { write: () => {} };
  const covered = buildCacheFor(withInstallRoots(downstream(first, { proofListings: listings([path.join(first, "packages/fluxiq/src/extra.txt"), path.join(base, "linked/node_modules/dep/index.js")]) })));
  assert.equal(await covered.proveInputs(["fluxiq:check"], { stdout: sink }), 0);
  let printed = "";
  const stray = buildCacheFor(withInstallRoots(downstream(first, { proofListings: listings([path.join(base, "stray/file.js")]) })));
  assert.equal(await stray.proveInputs(["fluxiq:check"], { stdout: { write: (text) => (printed += text) } }), 1);
  assert.match(printed, /FAIL fluxiq:check +tool[\s\S]*outside every input root: .*stray\/file\.js/u);
});

test("a runner that resolves to the exit code alone, as downstream runners did, is accepted", async () => {
  const cache = buildCacheFor(downstream(first));
  const options = (code) => ({ ...quiet(first), run: async () => code });
  const failed = await cache.runStep("fluxiq:check", options(3));
  assert.deepEqual([failed.result, failed.exitCode], ["build", 3]);
  assert.equal((await cache.runStep("fluxiq:check", options(0))).exitCode, 0);
  assert.equal((await cache.runStep("fluxiq:check", options(0))).result, "reuse");
});
