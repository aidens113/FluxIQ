import { readFileSync } from "node:fs";

const cssImportPattern = /@import\s+(?:url\(\s*)?(?:(["\u0027])([^"\u0027]+)\1|([^)\u0027"\s]+))\s*\)?[^;]*;/g;

function isLocalImport(specifier: string): boolean {
  return specifier.startsWith(".") || specifier.startsWith("file:");
}

function readCssSource(sourceUrl: URL, importStack: readonly string[]): string {
  const sourceKey = sourceUrl.href;
  if (importStack.includes(sourceKey)) {
    const cycle = [...importStack, sourceKey].map((entry) => new URL(entry).pathname).join(" -> ");
    throw new Error(`Circular CSS import detected: ${cycle}`);
  }

  const source = readFileSync(sourceUrl, "utf8");
  const nextStack = [...importStack, sourceKey];

  return source.replace(
    cssImportPattern,
    (statement, _quote: string | undefined, quoted: string | undefined, unquoted: string | undefined) => {
      const specifier = quoted ?? unquoted;
      if (!specifier || !isLocalImport(specifier)) return statement;
      return readCssSource(new URL(specifier, sourceUrl), nextStack);
    },
  );
}

/** Reads the effective source represented by a CSS import manifest. */
export function readCssManifest(sourceUrl: URL): string {
  if (sourceUrl.protocol !== "file:") throw new Error(`CSS manifest must be a local file URL: ${sourceUrl.href}`);
  return readCssSource(sourceUrl, []);
}
