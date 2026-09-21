import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_ACTION_CONSEQUENCE_PHRASES, parseAutomationStudioActionPermissionRequest } from "../index.ts";

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(testsDir, "..", "..", "..", "..", "..", "..", "..");
const subpath = "./automation-studio/action-permissions";

describe("the browser-safe action-permissions subpath", () => {
  it("is published from the package manifest", async () => {
    const manifest = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8")) as {
      exports: Record<string, { types: string; import: string }>;
    };
    expect(manifest.exports[subpath]).toEqual({
      types: "./dist/programs/automation-studio/runtime/action-permissions/client/index.d.ts",
      import: "./dist/programs/automation-studio/runtime/action-permissions/client/index.js"
    });
  });

  it("exports only the bounded display vocabulary and strict parser", () => {
    expect(AUTOMATION_STUDIO_ACTION_CONSEQUENCE_PHRASES.modify_existing).toBe("change something that already exists");
    expect(parseAutomationStudioActionPermissionRequest({})).toBeNull();
  });

  it("has no Node, package, gate, service or storage runtime dependency", async () => {
    const entry = path.resolve(testsDir, "..", "index.ts");
    const sources = [entry, path.resolve(testsDir, "..", "..", "consequences.ts"), path.resolve(testsDir, "..", "..", "request.ts")];
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
