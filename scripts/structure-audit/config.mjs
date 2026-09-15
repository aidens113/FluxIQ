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

  // Paths whose files build values that must satisfy an external wire
  // contract, where no property may arrive through a spread. TypeScript runs
  // no excess-property check on a property a spread brings in, so a renamed or
  // deleted contract field leaves the wire with every gate green. Each entry is
  // a directory prefix or a single file, with the `reason` it is configured and
  // the `remedy` a developer there should reach for; both go into the message.
  // Configure a path only once it is clean -- the finding is ratcheted and
  // `--update` never adds an entry, so a dirty path stays red until it is fixed.
  //
  // Core's own contracts are declared and checked inside `packages/contracts`,
  // and an object spread elsewhere in this repository is ordinary
  // copy-with-override, so banning it repository-wide would be wrong. The run
  // datasets collaborator is configured because it builds the store batches,
  // audit events, and export answers that dataset endpoints put on the wire.
  // The downstream web-extension repository configures its page-evidence
  // producers. An entry's path has no trailing slash: the rule matches
  // `<path>/` itself.
  contractSpreadPaths: [
    {
      path: "packages/fluxiq/src/programs/automation-studio/runtime/service/datasets",
      reason: "the run datasets collaborator builds the store batches, audit events, and export answers that dataset endpoints return",
      remedy: "Write each field by name, passing an absent optional field as `undefined`."
    }
  ],

  // Path prefixes exempt from the depth limit because a framework dictates
  // their layout. The Next.js app router encodes routes as directories.
  depthExemptPrefixes: ["apps/web/src/app"],

  // Filenames (without extension) and directory names that name nothing.
  bannedBasenames: ["utils", "helpers", "misc", "common", "shared-ui"],
  bannedDirectoryNames: ["utils", "helpers", "misc", "common"],

  workingDocsDir: "docs/working",
  workingDocsIndexKind: "core"
};
