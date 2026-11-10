import { readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const stylesRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = resolve(stylesRoot, "../../../app");
const globalsPath = join(appRoot, "globals.css");
// The Studio views' styles load with the graph editor under a Flow's Advanced section.
const studioRouteRoot = join(appRoot, "(panel)/flows/[flowId]/graph");
const studioManifestPath = join(studioRouteRoot, "graph.css");
// The run page reuses the run views, so it loads the runtime and state styles itself.
// Only these two route manifests may import Studio view styles.
const runManifestPath = join(appRoot, "(panel)/runs/[runId]/run.css");
const studioLayoutPath = join(studioRouteRoot, "layout.tsx");
const rootLayoutPath = join(appRoot, "layout.tsx");
const deletedLegacyStylesheet = normalize(
  join(stylesRoot, "instructions-settings-adaptations-problems/02-proposals.css"),
);
const expectedDomains = new Set([
  "datasets",
  "flow-editor",
  "instructions-settings-adaptations-problems",
  "recordings-clients-inspector",
  "runtime",
  "state",
]);
const retiredStylesheets = new Set<string>();

function cssFilesUnder(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory()
      ? cssFilesUnder(path)
      : extname(entry.name) === ".css"
        ? [normalize(path)]
        : [];
  });
}

function importedCssFiles(): string[] {
  return readFileSync(studioManifestPath, "utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => {
      const importPath = line.match(/^@import "([^"]+)";$/u)?.[1];
      if (!importPath) {
        throw new Error(`Invalid globals.css manifest entry: ${line}`);
      }
      return normalize(resolve(studioRouteRoot, importPath));
    });
}

describe("Automation Studio CSS architecture", () => {
  it("keeps the global and Studio manifests import-only and route-scoped", () => {
    const globals = readFileSync(globalsPath, "utf8");
    const studio = readFileSync(studioManifestPath, "utf8");
    const rootLayout = readFileSync(rootLayoutPath, "utf8");
    const studioLayout = readFileSync(studioLayoutPath, "utf8");

    expect(globals).not.toContain(".automation-");
    expect(globals).not.toContain("{");
    expect(globals).not.toContain("automation-studio");
    expect(studio).not.toContain("{");
    expect(rootLayout).not.toContain("@xyflow/react/dist/style.css");
    expect(studioLayout).toContain('import "@xyflow/react/dist/style.css"');
    expect(studioLayout).toContain('import "./graph.css"');
    expect(importedCssFiles().length).toBeGreaterThan(0);
  });

  it("imports every active Automation Studio stylesheet exactly once", () => {
    const imports = importedCssFiles();
    const featureFiles = cssFilesUnder(stylesRoot)
      .filter((path) => !retiredStylesheets.has(path))
      .sort();
    const featureImports = imports.filter((path) => path.startsWith(normalize(stylesRoot))).sort();

    expect(new Set(imports).size).toBe(imports.length);
    expect(featureImports).toEqual(featureFiles);
    for (const retiredStylesheet of retiredStylesheets) {
      expect(imports).not.toContain(retiredStylesheet);
    }
    expect(featureFiles).not.toContain(deletedLegacyStylesheet);
    expect(imports).not.toContain(deletedLegacyStylesheet);
  });

  it("requires explicit domain ownership and bounded partials", () => {
    const files = cssFilesUnder(stylesRoot);
    const domains = new Set<string>();

    for (const file of files) {
      const relative = file.slice(normalize(stylesRoot).length + 1);
      const [domain, ...rest] = relative.split(/[\\/]/u);
      if (!domain) {
        throw new Error(`Missing CSS domain owner for ${relative}`);
      }
      const css = readFileSync(file, "utf8");
      const lineCount = css.split(/\r?\n/u).length;

      domains.add(domain);
      expect(expectedDomains.has(domain), `${relative} has no recognized domain owner`).toBe(true);
      expect(rest.length, `${relative} must live under a domain directory`).toBeGreaterThan(0);
      expect(css, `${relative} must own Automation Studio selectors`).toContain("automation-");
      expect(lineCount, `${relative} is too large; split it by responsibility`).toBeLessThanOrEqual(700);
      expect(css, `${relative} contains unrelated secret-management styles`).not.toMatch(/\.secret-(?:key|auth)/u);
      expect(css, `${relative} contains unrelated documentation styles`).not.toMatch(/\.documentation-/u);
    }

    expect(domains).toEqual(expectedDomains);
  });

  it("keeps Automation Studio selectors out of every app-level stylesheet", () => {
    const appStyles = cssFilesUnder(appRoot).filter((file) => file !== normalize(globalsPath));

    for (const file of appStyles) {
      expect(readFileSync(file, "utf8"), file).not.toContain(".automation-");
    }
  });

  it("keeps feature style imports owned by the Studio route manifests", () => {
    const owners = [normalize(globalsPath), normalize(studioManifestPath), normalize(runManifestPath)];
    const appStyles = cssFilesUnder(appRoot).filter((file) => !owners.includes(file));

    for (const file of appStyles) {
      const css = readFileSync(file, "utf8");
      expect(css, file).not.toMatch(/@import\s+["'][^"']*automation-studio[^"']*["']/u);
    }

    // The run page's manifest is import-only, imports each stylesheet at most once, and only
    // stylesheets the Studio manifest also owns, so no style exists outside the Studio set.
    const runImports = readFileSync(runManifestPath, "utf8")
      .split(/\r?\n/u)
      .filter(Boolean)
      .map((line) => {
        const importPath = line.match(/^@import "([^"]+)";$/u)?.[1];
        if (!importPath) {
          throw new Error(`Invalid run.css manifest entry: ${line}`);
        }
        return normalize(resolve(dirname(runManifestPath), importPath));
      });
    const studioImports = importedCssFiles();
    expect(runImports.length).toBeGreaterThan(0);
    expect(new Set(runImports).size).toBe(runImports.length);
    for (const path of runImports) {
      expect(path.startsWith(normalize(stylesRoot)), path).toBe(true);
      expect(studioImports, path).toContain(path);
    }

    expect(readFileSync(globalsPath, "utf8")).not.toMatch(/automation-studio|@xyflow/u);
    const imports = studioImports.filter((path) => path.startsWith(normalize(stylesRoot)));
    expect(imports).toHaveLength(cssFilesUnder(stylesRoot).length - retiredStylesheets.size);
  });
});
