import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The panel has one token system: the package's tokens.css, loaded once at the app root. This is
// the mechanical guard that keeps it so (a rule written down is not a rule).
const srcRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const tokensPath = createRequire(import.meta.url).resolve("@fluxiq/ui-components/styles/tokens.css");

const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//gu, "");
const names = (css: string): Set<string> => new Set([...stripComments(css).matchAll(/(?<![\w-])(--[a-z0-9-]+)\s*:/giu)].map((match) => match[1]!));

function cssFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : cssFiles(target);
    return entry.name.endsWith(".css") ? [target] : [];
  });
}

const files = cssFiles(srcRoot).map((file) => ({ name: path.relative(srcRoot, file).split(path.sep).join("/"), css: stripComments(readFileSync(file, "utf8")) }));
const packageTokens = names(readFileSync(tokensPath, "utf8"));
const panelOwn = new Set(files.flatMap((file) => [...names(file.css)]));

describe("the panel's one token system", () => {
  it("finds the package's tokens and the panel's stylesheets", () => {
    expect(packageTokens.size).toBeGreaterThan(40);
    expect(files.length).toBeGreaterThan(20);
  });

  it("defines no custom property that the package's tokens.css defines", () => {
    const clashes = files.flatMap((file) => [...names(file.css)].filter((name) => packageTokens.has(name)).map((name) => `${file.name}: ${name}`));
    expect(clashes).toEqual([]);
  });

  it("holds no colour literal and no gradient", () => {
    const literal = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(|\b(?:repeating-)?(?:linear|radial|conic)-gradient\(/giu;
    const found = files.flatMap((file) => [...file.css.matchAll(literal)].map((match) => `${file.name}: ${match[0]}`));
    expect(found).toEqual([]);
  });

  it("uses only custom properties the package or the panel defines, unless the use carries its own fallback", () => {
    const unknown = files.flatMap((file) => [...file.css.matchAll(/var\(\s*(--[a-z0-9-]+)\s*\)/giu)].map((match) => match[1]!).filter((name) => !packageTokens.has(name) && !panelOwn.has(name)).map((name) => `${file.name}: ${name}`));
    expect(unknown).toEqual([]);
  });
});
