// The cache root and the two refusals a cache root can earn. Moved from the
// downstream web extension's Lab, where every case below was measured.

import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { insideNodeModules, webBuildCacheRoot, webBuildPathBudget } from "../index.mjs";

test("the cache belongs to the Core, so every worktree beside it resolves the same directory, inside .tmp/", () => {
  const core = path.resolve("F:/fxwork/!FluxIQ");
  assert.equal(webBuildCacheRoot(core, {}), path.join(core, ".tmp", "web-build"));
  assert.notEqual(webBuildCacheRoot("F:/fxwork/!FluxIQ", {}), webBuildCacheRoot("F:/fxwork/t012/!FluxIQ", {}), "a nested Core is a different Core");
});

test("FLUXIQ_CORE_WEB_BUILD_CACHE overrides it; a blank value does not", () => {
  assert.equal(webBuildCacheRoot("F:/fxwork/!FluxIQ", { FLUXIQ_CORE_WEB_BUILD_CACHE: "F:/fxcache" }), path.resolve("F:/fxcache"));
  assert.equal(webBuildCacheRoot("F:/fxwork/!FluxIQ", { FLUXIQ_CORE_WEB_BUILD_CACHE: "   " }), path.join(path.resolve("F:/fxwork/!FluxIQ"), ".tmp", "web-build"));
});

test("a node_modules segment anywhere is recognised, and a name merely containing the word is not", () => {
  assert.equal(insideNodeModules("F:/fxwork/!FluxIQ/node_modules/.web-build"), true);
  assert.equal(insideNodeModules(path.win32.join("F:", "t013ab", "node_modules", "cwb")), true, "Windows separators");
  assert.equal(insideNodeModules("F:/x/NODE_MODULES/cwb"), true, "Windows paths are case-insensitive");
  assert.equal(insideNodeModules("F:/t013ab/plain_modules/cwb"), false);
  assert.equal(insideNodeModules("F:/my-node_modules-notes/cwb"), false);
  assert.equal(insideNodeModules(webBuildCacheRoot("F:/fxwork/!FluxIQ", {})), false, "the default never does");
});

test("the path budget tells apart the worktree cache that failed from the one beside it that worked", () => {
  // Measured 2026-09-18: t015 lost three builds to a Turbopack path-length error;
  // t010, four characters shorter, worked with two characters to spare.
  const perWorktree = (slug, instance) => path.win32.join("F:/fxwork", slug, "test-runs", "instances", instance, ".core-web-build");
  const failed = webBuildPathBudget(perWorktree("t015-extraction-mismatch-detail", "t015"), "win32");
  assert.deepEqual([failed.fits, failed.root, failed.longest], [false, 82, 261]);
  const worked = webBuildPathBudget(perWorktree("t010-click-landing-in-place", "t010"), "win32");
  assert.deepEqual([worked.fits, worked.root, worked.longest], [true, 78, 257]);
});

test("beside its Core the cache has real headroom; only Windows has a limit this low", () => {
  const shared = webBuildPathBudget(webBuildCacheRoot("F:/fxwork/!FluxIQ", {}), "win32");
  assert.equal(shared.fits, true);
  assert.ok(shared.allowed - shared.root >= 30, `expected real headroom, got ${shared.allowed - shared.root}`);
  const long = `/home/${"x".repeat(300)}/.web-build`;
  assert.equal(webBuildPathBudget(long, "linux").fits, true);
  assert.equal(webBuildPathBudget(long, "win32").fits, false);
  assert.equal(webBuildPathBudget("F:/x", "win32").allowed, 259 - 178 - 1);
});
