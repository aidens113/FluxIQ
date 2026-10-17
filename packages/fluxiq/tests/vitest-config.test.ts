import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Guards `../vitest.config.ts`: every `@fluxiq/contracts` entry the package
// exports is served to these tests as the very module its source defines, never
// the compiled, untracked dist. A dist older than its source made 18 tests fail
// on an undefined export in the 2026-10-17 sweep while tsc, which reads the
// source, passed (t695).
const contractsRoot = new URL("../../contracts/", import.meta.url);
const exported: Record<string, unknown> = JSON.parse(readFileSync(new URL("package.json", contractsRoot), "utf8")).exports;
const entries = Object.keys(exported).map((subpath) => {
  const name = subpath === "." ? "" : subpath.slice(2);
  return { specifier: name ? `@fluxiq/contracts/${name}` : "@fluxiq/contracts", source: fileURLToPath(new URL(`src/${name || "index"}.ts`, contractsRoot)) };
});

describe("@fluxiq/contracts in this package's tests", () => {
  it("covers every entry the contracts package exports", () => {
    expect(entries.map((entry) => entry.specifier)).toContain("@fluxiq/contracts/client-gateway");
  });

  it.each(entries)("serves $specifier as its source module, not the compiled dist", async ({ specifier, source }) => {
    const served: Record<string, unknown> = await import(/* @vite-ignore */ specifier);
    const own: Record<string, unknown> = await import(/* @vite-ignore */ source);
    expect(Object.keys(served).sort()).toEqual(Object.keys(own).sort());
    for (const key of Object.keys(own)) expect(served[key], key).toBe(own[key]);
  });
});
