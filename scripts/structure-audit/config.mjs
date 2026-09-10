// Repository-specific configuration for structure-audit. This is the only
// file that differs between FluxIQ Core and the downstream web-extension
// repository; the entry point, context, baseline, and rules are mirrored.

export const CONFIG = {
  repository: "core",

  // Directories whose basename marks a test root. Test files must live
  // directly inside one of these. "e2e" is a runner-owned root, not
  // co-location.
  testRootDirNames: ["tests", "e2e"],

  // Import specifiers that must never appear in this repository's sources.
  forbiddenImports: [
    {
      pattern: /fluxiq-web-extension|FluxIQWebExtension/i,
      reason: "FluxIQ Core must never import a downstream domain repository."
    }
  ],

  // Directory-scoped import boundaries: files under `from` must not import
  // anything resolving under `to`.
  importBoundaries: [],

  // Path prefixes exempt from the depth limit because a framework dictates
  // their layout. The Next.js app router encodes routes as directories.
  depthExemptPrefixes: ["apps/web/src/app"],

  // Filenames (without extension) and directory names that name nothing.
  bannedBasenames: ["utils", "helpers", "misc", "common", "shared-ui"],
  bannedDirectoryNames: ["utils", "helpers", "misc", "common"],

  workingDocsDir: "docs/working",
  workingDocsIndexKind: "core"
};
