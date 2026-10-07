import { expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";

it("initializes actual framework first and preserves only real unaltered factory provenance", async () => {
  await import("../../../../../framework/index.ts");
  const { createCanonicalAutomationStudioSQLiteRepositories, canonicalAutomationStudioSQLiteFactoryRoot } = await import("../../index.ts");
  const path = await import("node:path"), os = await import("node:os");
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
}, 60000);
