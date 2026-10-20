// The framework is imported first, before the storage factory, and statically:
// module evaluation follows import order, so the framework still initializes
// first, while the transform of the whole framework happens when the file is
// collected rather than inside the timed test body. Imported there, it took
// over 60 s alone on a loaded machine (t731), though only 7 s in a package run
// whose worker had already transformed most of it.
import "../../../../../framework/index.ts";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { createCanonicalAutomationStudioSQLiteRepositories, canonicalAutomationStudioSQLiteFactoryRoot } from "../../index.ts";

it("initializes actual framework first and preserves only real unaltered factory provenance", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "whole-unopened-provenance-"));
  try {
  const actual = createCanonicalAutomationStudioSQLiteRepositories(root);
  expect(canonicalAutomationStudioSQLiteFactoryRoot(actual)).toBe(root);
  expect(() => canonicalAutomationStudioSQLiteFactoryRoot({ ...actual })).toThrow("factory_provenance");
  Object.defineProperty(actual, "flows", { get() { throw new Error("accessor must not run"); }, enumerable: true });
  expect(() => canonicalAutomationStudioSQLiteFactoryRoot(actual)).toThrow("factory_provenance");
  const symbol = createCanonicalAutomationStudioSQLiteRepositories(root); Object.defineProperty(symbol, Symbol("unexpected"), { value: true });
  expect(() => canonicalAutomationStudioSQLiteFactoryRoot(symbol)).toThrow("factory_provenance");
  } finally { if (path.dirname(root) !== os.tmpdir() || !path.basename(root).startsWith("whole-unopened-provenance-")) throw new Error("Unsafe provenance cleanup"); await rm(root, { recursive: true, force: true }); }
});
