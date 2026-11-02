import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { expect, it } from "vitest";
const sourceRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const owners = ["components/automation/importer", "components/automation/target-refresh", "runtime/native-execution", "runtime/adapters"];
function sources(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory())
      return entry.name === "tests" ? [] : sources(filename);
    return filename.endsWith(".ts") ? [filename] : [];
  });
}
it("loads canonical R1 mechanisms without Studio or an engine dependency", async () => {
  for (const owner of owners) {
    for (const filename of sources(path.join(sourceRoot, owner))) {
      const imports = fs.readFileSync(filename, "utf8").matchAll(/(?:from\s*|import\s*)["']([^"']+)["']/gu);
      for (const imported of imports) {
        expect(imported[1], filename).not.toMatch(/automation-studio|(?:^|\/)engine\//u);
        if (imported[1]!.startsWith(".")) expect(fs.existsSync(path.resolve(path.dirname(filename), imported[1]!)), `${filename}: ${imported[1]}`).toBe(true);
      }
    }
  }
  const bundle = await build({
    entryPoints: owners.map((owner) => path.join(sourceRoot, owner, "index.ts")),
    outdir: "r1-closure-probe", bundle: true, write: false, metafile: true,
    platform: "node", format: "esm", packages: "external", logLevel: "silent"
  });
  expect(Object.keys(bundle.metafile!.inputs).filter((filename) => /programs\/automation-studio|(?:^|\/)engine\//u.test(filename.replaceAll("\\", "/")))).toEqual([]);
});
