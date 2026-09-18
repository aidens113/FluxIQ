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
  // anything resolving under `to`. `valueOnly: true` narrows the ban to the
  // imports that survive into the emitted module graph, leaving `import type`
  // and `export type` alone.
  //
  // The automation-studio runtime entry is a cycle guard, and the direction is
  // the one that must never exist. `runtime/recovery/` legitimately imports
  // values out of `runtime/llm/`: it drives the evidence loop, so the loop has
  // to evaluate first. That makes the return edge a cycle, and a cycle here is
  // not a style problem -- twice in one day a `runtime/recovery/` module read a
  // `runtime/llm/` constant during module evaluation and got `undefined` with a
  // completely clean type check, once silently emptying an opaque handle's
  // `pattern`, `maxLength` and `maxProperties` out of the JSON schema actually
  // sent to the provider. A single failing test caught both; nothing else did.
  //
  // A type is erased before any of that can happen, so type-only imports across
  // the edge stay allowed and the harness keeps reading recovery's contracts.
  // What is banned is a value: a constant, a function, a class, a bare
  // `import "..."` for effect, or a dynamic `import()`.
  importBoundaries: [
    {
      from: "packages/fluxiq/src/programs/automation-studio/runtime/llm",
      to: "packages/fluxiq/src/programs/automation-studio/runtime/recovery",
      valueOnly: true,
      reason: "runtime/llm must not import a value out of runtime/recovery: recovery drives the evidence loop out of runtime/llm, so the return edge closes a module cycle and a constant read at module-evaluation time arrives undefined with a clean type check. Import the type if that is what you need, call the value from the coordinator that already owns both sides, or move the shared value into runtime/loop-limits/, which neither directory owns."
    }
  ],

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
    },
    {
      // The permission request is what a person grants or refuses from, and
      // the gate is the one place it is built. A field that stopped arriving --
      // the consequence, the control's name -- would ask a person a question
      // they cannot answer, with every gate green.
      path: "packages/fluxiq/src/programs/automation-studio/runtime/action-permissions",
      reason: "the action-permission gate builds the request a run carries out to a person, and the grant's permission set",
      remedy: "Write each field by name, passing an absent value as `null`."
    }
  ],

  // Path prefixes whose source must stay neutral about any single domain: the
  // web-vocabulary rule reads every name declared or read under them and fails
  // on a web or DOM word that is not already baselined.
  //
  // `packages/` is the whole of it, and deliberately so. It is what a domain
  // repository installs and imports, so a web word that lands there becomes a
  // field every other domain carries. `apps/web` is out: it is Core's own
  // Next.js interface, and a React component legitimately owns a class name, a
  // click handler and a scroll container -- that is the DOM used as a UI
  // toolkit, not Core learning one domain's vocabulary. `scripts/` is out for
  // the same reason; the docs-links rule parses HTML anchors because Markdown
  // contains them.
  domainNeutralPaths: ["packages"],

  // Path prefixes exempt from the depth limit because a framework dictates
  // their layout. The Next.js app router encodes routes as directories.
  depthExemptPrefixes: ["apps/web/src/app"],

  // Filenames (without extension) and directory names that name nothing.
  bannedBasenames: ["utils", "helpers", "misc", "common", "shared-ui"],
  bannedDirectoryNames: ["utils", "helpers", "misc", "common"],

  // Directory prefixes whose Markdown the docs-links rule checks: every local
  // link must resolve to a tracked file, and every `#fragment` to a heading
  // that still exists. Like contractSpreadPaths, a prefix is configured once it
  // is clean -- the finding does not ratchet, so a listed directory stays
  // resolvable rather than accumulating dead links behind a recorded number.
  //
  // All of docs/ is in, and clean. The rule replaced scripts/validate-docs.mjs,
  // which checked link existence over this same tree from the separate
  // `pnpm docs:check` step: the scope is unchanged, anchors are new, and it now
  // runs inside `pnpm check`. The repository root's own Markdown is deliberately
  // out -- AGENTS.md links sideways into the web-extension checkout, which is
  // not this repository's to resolve.
  docsLinkDirs: ["docs"],

  workingDocsDir: "docs/working",
  workingDocsIndexKind: "core"
};
