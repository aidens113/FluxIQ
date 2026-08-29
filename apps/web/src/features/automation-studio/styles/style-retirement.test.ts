import { readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const stylesRoot = dirname(fileURLToPath(import.meta.url));
const studioRoot = resolve(stylesRoot, "..");
const appRoot = resolve(studioRoot, "../../app");
const globalsPath = join(appRoot, "globals.css");
const deletedLegacyStylesheets = [
  "instructions-settings-adaptations-problems/02-proposals.css",
  "instructions-settings-adaptations-problems/03-proposal-editor.css",
  "recordings-clients-inspector/04-legacy-config.css",
] as const;const retiredSelectorPrefix =
  /^automation-(?:proposal|evidence|pipeline|config|routine|graph-embed)/u;

function filesUnder(root: string, extensions: ReadonlySet<string>): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory()
      ? filesUnder(path, extensions)
      : extensions.has(extname(entry.name))
        ? [path]
        : [];
  });
}

function productionSource(): string {
  return filesUnder(studioRoot, new Set([".ts", ".tsx"]))
    .filter((path) => !path.includes(".test."))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
}

function imported(relativePath: string): boolean {
  const expected = '@import "../features/automation-studio/styles/' + relativePath + '";';
  return readFileSync(globalsPath, "utf8").includes(expected);
}

function retiredSelectorClasses(): string[] {
  return [...new Set(
    filesUnder(stylesRoot, new Set([".css"]))
      .flatMap((path) => [...readFileSync(path, "utf8").matchAll(/\.([a-z][\w-]*)/gu)])
      .map((match) => match[1])
      .filter((className): className is string =>
        Boolean(className && retiredSelectorPrefix.test(className))),
  )].sort();
}

describe("retired Automation Studio styles", () => {
  it("does not retain deleted Proposal, run-workspace, or legacy Config packages", () => {
    const cssFiles = filesUnder(stylesRoot, new Set([".css"])).map(normalizePath);

    for (const stylesheet of deletedLegacyStylesheets) {
      expect(imported(stylesheet), stylesheet).toBe(false);
      expect(cssFiles).not.toContain(normalizePath(join(stylesRoot, stylesheet)));
    }
  });

  it("keeps retired Proposal, Config, Routine, and Evidence selectors out of production markup", () => {
    const source = productionSource();
    const retiredClasses = retiredSelectorClasses();

    expect(retiredClasses.length).toBeGreaterThan(0);
    for (const className of retiredClasses) {
      expect(source, className).not.toContain(className);
    }
  });

  it("keeps active run-workspace styles under Runtime ownership", () => {
    const source = productionSource();
    const runtimeStyles = readFileSync(join(stylesRoot, "runtime/03-runs-workspace.css"), "utf8");

    expect(imported("runtime/03-runs-workspace.css")).toBe(true);
    expect(imported("workspace/08-view-workspaces.css")).toBe(true);
    expect(runtimeStyles).toContain(".automation-runs-workspace > header");
    expect(source).toContain("automation-runs-workspace");
  });
});

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").toLowerCase();
}