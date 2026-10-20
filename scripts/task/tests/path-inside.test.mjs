import assert from "node:assert/strict";
import test from "node:test";

import { pathInside } from "../path-inside.mjs";

test("inside means the parent itself or below it, never a sibling sharing a prefix", () => {
  assert.equal(pathInside("F:/fxlab/!FluxIQ", "F:/fxlab/!FluxIQ/packages/fluxiq"), true);
  assert.equal(pathInside("F:/fxlab/!FluxIQ", "F:/fxlab/!FluxIQ"), true);
  assert.equal(pathInside("F:/fxlab/!FluxIQ/", "F:/fxlab/!FluxIQ/packages"), true);
  assert.equal(pathInside("F:/fxlab/!FluxIQ", "F:/fxlab/!FluxIQ-old/packages/fluxiq"), false);
  assert.equal(pathInside("F:/fxlab/!FluxIQ", "F:/!FluxIQ/packages/fluxiq"), false);
  assert.equal(pathInside("F:/fxlab/!FluxIQ/packages", "F:/fxlab/!FluxIQ"), false, "a parent is not inside its child");
});

test("a child whose name merely starts with dots is still inside", () => {
  assert.equal(pathInside("F:/fxlab", "F:/fxlab/..hidden"), true);
});

test("on Windows, case and slash direction do not move a path outside", { skip: process.platform !== "win32" }, () => {
  assert.equal(pathInside("F:/fxlab/!FluxIQ", "F:\\FXLAB\\!fluxiq\\packages\\fluxiq"), true);
});
