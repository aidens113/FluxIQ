import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { expect, it } from "vitest";
const sourceRoot = fileURLToPath(new URL("../../../", import.meta.url));
const owners = ["runtime/output-dispatch", "engine/automation/integration"];
function sources(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory())
      return entry.name === "tests" ? [] : sources(filename);
    return filename.endsWith(".ts") ? [filename] : [];
  });
}
it("loads independent dispatch and engine integration without Studio or a runtime-to-engine inversion", async () => {
  for (const owner of owners) {
    for (const filename of sources(path.join(sourceRoot, owner))) {
      const imports = fs.readFileSync(filename, "utf8").matchAll(/(?:from\s*|import\s*)["']([^"']+)["']/gu);
      for (const imported of imports) {
        expect(imported[1], filename).not.toContain("automation-studio");
        if (imported[1]!.startsWith(".")) {
          const resolved = path.resolve(path.dirname(filename), imported[1]!);
          expect(fs.existsSync(resolved), `${filename}: ${imported[1]}`).toBe(true);
          if (owner.startsWith("runtime/"))
            expect(resolved.replaceAll("\\", "/")).not.toMatch(/\/engine\//u);
        }
      }
    }
    const bundle = await build({ entryPoints: [path.join(sourceRoot, owner, "index.ts")], outdir: "output-dispatch-closure", bundle: true, write: false, metafile: true, platform: "node", format: "esm", packages: "external", logLevel: "silent" });
    const inputs = Object.keys(bundle.metafile!.inputs).map((filename) => filename.replaceAll("\\", "/"));
    expect(inputs.filter((filename) => /programs\/automation-studio/u.test(filename))).toEqual([]);
    if (owner.startsWith("runtime/"))
      expect(inputs.filter((filename) => /(?:^|\/)engine\//u.test(filename))).toEqual([]);
  }
});
