// The browser-safe panel-capabilities subpath: published, narrow, and free of
// anything a browser cannot run. Mirrors the action-permissions client suite,
// which is the other subpath the panel imports.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { automationStudioPanelCapabilityVocabulary, parseAutomationStudioPanelCapabilities } from "../index.ts";

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(testsDir, "..", "..", "..", "..", "..", "..", "..");
const subpath = "./automation-studio/panel-capabilities";

describe("the browser-safe panel-capabilities subpath", () => {
  it("is published from the package manifest", async () => {
    const manifest = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8")) as {
      exports: Record<string, { types: string; import: string }>;
    };
    expect(manifest.exports[subpath]).toEqual({
      types: "./dist/programs/automation-studio/runtime/panel-capabilities/client/index.d.ts",
      import: "./dist/programs/automation-studio/runtime/panel-capabilities/client/index.js"
    });
  });

  it("carries the panel's own list across and writes it out for a model", () => {
    const capabilities = parseAutomationStudioPanelCapabilities([{ id: "flow.build", summary: "build a Flow from a sentence", group: "Flows" }]);
    expect(automationStudioPanelCapabilityVocabulary(capabilities)).toContain("flow.build -- build a Flow from a sentence");
  });

  it("has no Node, package, gate, service or storage runtime dependency", async () => {
    const entry = path.resolve(testsDir, "..", "index.ts");
    const sources = [
      entry,
      path.resolve(testsDir, "..", "..", "capability.ts"),
      path.resolve(testsDir, "..", "..", "parse.ts"),
      path.resolve(testsDir, "..", "..", "vocabulary.ts")
    ];
    const offenders: string[] = [];
    for (const file of sources) {
      const source = await readFile(file, "utf8");
      for (const match of source.matchAll(/(?:^|\n)\s*(?:import|export)\s+([^;]*?)\bfrom\s*["']([^"']+)["']/g)) {
        const clause = match[1] ?? "";
        const specifier = match[2] ?? "";
        if (specifier.startsWith("node:") || (!specifier.startsWith(".") && !/^type\b/u.test(clause))
          || /(?:gate|service|storage)/u.test(specifier)) offenders.push(`${path.basename(file)}:${specifier}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
