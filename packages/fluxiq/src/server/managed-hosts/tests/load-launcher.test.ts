import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { loadManagedHostLauncher } from "../load-launcher.ts";

it("loads an explicitly configured ESM factory or launcher and refuses invalid modules", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-launcher-test-"));
  try {
    await writeFile(path.join(root, "factory.mjs"), "export function createFluxIQHostLauncher(env) { return { launch() { return env.FIXTURE_VALUE; } }; }");
    const launcher = await loadManagedHostLauncher("./factory.mjs", { FIXTURE_VALUE: "fixture" }, root);
    expect(launcher.launch).toBeTypeOf("function");
    await writeFile(path.join(root, "bad.mjs"), "export default {};");
    await expect(loadManagedHostLauncher("./bad.mjs", {}, root)).rejects.toThrow("must export a launcher");
    await expect(loadManagedHostLauncher(undefined, {}, root)).rejects.toThrow("FLUXIQ_BROWSER_HOST");
  } finally {
    if (path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith("fluxiq-launcher-test-")) throw new Error("Refusing test cleanup outside its owned directory");
    await rm(root, { recursive: true, force: true });
  }
});
