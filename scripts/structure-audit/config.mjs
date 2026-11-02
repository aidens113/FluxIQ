// Repository-specific configuration for structure-audit. This is the only
// file that differs between FluxIQ Core and the downstream web-extension
// repository; the entry point, context, baseline, and rules are mirrored.

export const CONFIG = {
  repository: "core",

  // Private execution companions do not survive object spread. Type-based,
  // source-only enforcement keeps every production copy on the same helper.
  executionOptionsCopy: {
    from: ["packages/fluxiq/src/"],
    tsconfig: "packages/fluxiq/tsconfig.json",
    declaration: "packages/fluxiq/src/engine/automation/contracts/graph-execution-options.ts",
    typeName: "AutomationStudioGraphExecutionOptions",
    copy: "packages/fluxiq/src/engine/automation/execution-admission/copy.ts"
  },

  // Directories whose basename marks a test root. Test files must live
  // directly inside one of these. "e2e" is a runner-owned root, not
  // co-location.
  testRootDirNames: ["tests", "e2e"],

  // Import specifiers that must never appear in this repository's sources.
  forbiddenImports: [
    {
      from: "packages/fluxiq/src/runtime",
      pattern: /(?:@fluxiq\/contracts\/automation-studio|programs\/automation-studio|^fluxiq\/automation-studio(?:\/|$))/,
      reason: "The framework runtime owns generic execution contracts. Import @fluxiq/contracts/runtime; Automation Studio adapts to the framework runtime, never the reverse."
    },
    {
      from: "packages/fluxiq/src/components/automation",
      pattern: /^(?:@fluxiq\/contracts|fluxiq)\/automation-studio(?:\/|$)/,
      reason: "Framework nodes use neutral runtime, records and recording-capture contracts, without a Studio dependency."
    },
    {
      from: "packages/fluxiq/src/engine/automation",
      pattern: /^(?:@fluxiq\/contracts|fluxiq)\/automation-studio(?:\/|$)/,
      reason: "Graph execution uses neutral runtime and record contracts, without a Studio dependency."
    },
    {
      from: "packages/fluxiq/src/flows/executable",
      pattern: /^(?:@fluxiq\/contracts|fluxiq)\/automation-studio(?:\/|$)/,
      reason: "Executable graph contracts and compilation must be usable without Studio."
    },
    {
      pattern: /fluxiq-web-extension|FluxIQWebExtension/i,
      reason: "FluxIQ Core must never import a downstream domain repository."
    },
    {
      from: "apps/web/src",
      pattern: /^@fluxiq\/contracts(\/|$)/,
      reason: "apps/web does not depend on @fluxiq/contracts: tsc passes through tsconfig.base paths, but the Next.js production build (tsconfig.build.json, no paths) fails with TS2307 and every Lab run fails at setup. Import through a fluxiq subpath instead (for example fluxiq/client-gateway re-exports @fluxiq/contracts/client-gateway). Type-only imports and tests count too."
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
      from: "packages/fluxiq/src/framework/persistence",
      to: "packages/fluxiq/src/programs",
      reason: "Framework persistence owns the original storage implementations; programs consume them through public contracts and compatibility aliases."
    },
    {
      from: "packages/fluxiq/src/framework/observability/performance",
      to: "packages/fluxiq/src/programs",
      reason: "Shared performance instrumentation is a framework capability and must not depend on program implementation or DTO ownership."
    },
    {
      from: "packages/fluxiq/src/components/automation",
      to: "packages/fluxiq/src/programs/automation-studio",
      reason: "Automation nodes are framework capabilities; Studio composes the node pack and must not own any dependency of it."
    },
    {
      from: "packages/fluxiq/src/flows/executable",
      to: "packages/fluxiq/src/programs/automation-studio",
      reason: "Executable flow contracts are framework-owned; editor and project models adapt to these contracts."
    },
    {
      from: "packages/fluxiq/src/engine/automation",
      to: "packages/fluxiq/src/programs/automation-studio",
      reason: "The automation executor is framework-owned; program composition and persistence cannot be dependencies of the engine."
    },
    {
      from: "packages/fluxiq/src/runtime/automation-host",
      to: "packages/fluxiq/src/engine/automation",
      reason: "Host ports own the contracts consumed by the engine; they cannot depend back on the executor."
    },
    {
      from: "packages/fluxiq/src/programs/automation-studio/runtime/llm",
      to: "packages/fluxiq/src/programs/automation-studio/runtime/recovery",
      valueOnly: true,
      reason: "runtime/llm must not import a value out of runtime/recovery: recovery drives the evidence loop out of runtime/llm, so the return edge closes a module cycle and a constant read at module-evaluation time arrives undefined with a clean type check. Import the type if that is what you need, call the value from the coordinator that already owns both sides, or move the shared value into runtime/loop-limits/, which neither directory owns."
    }
  ],

  // Where browser bundles enter this repository, for the browser-imports rule:
  // nothing reachable from these by a value import may import a Node built-in
  // or an undeclared package. Each entry is the SOURCE of a module a downstream
  // browser bundle loads.
  //
  // These are the modules the web extension's bundles (background, content,
  // page-world, popup, sidepanel) enter Core through, read from the bundle's
  // own metafile on 2026-09-30, not chosen by hand. The extension's `pnpm check`
  // bundles every entry and fails when the bundle enters Core through a module
  // missing here (apps/extension/scripts/check-extension.mjs), so this list
  // cannot fall behind the bundle. The two `client` subpaths are published for
  // browsers and held to it too.
  browserBundles: {
    consumer: "the web extension's browser bundles",
    entries: [
      "packages/fluxiq/src/components/automation/index.ts",
      "packages/fluxiq/src/components/automation/action-effect/index.ts",
      "packages/fluxiq/src/runtime/target-matching/index.ts",
      "packages/fluxiq/src/runtime/result-verification/index.ts",
      "packages/fluxiq/src/flows/executable/verification/index.ts",
      "packages/fluxiq/src/flows/executable/validation/index.ts",
      "packages/fluxiq/src/programs/automation-studio/nodes/index.ts",
      "packages/fluxiq/src/programs/automation-studio/nodes/action-effect/index.ts",
      "packages/fluxiq/src/programs/automation-studio/runtime/actionability/index.ts",
      "packages/fluxiq/src/programs/automation-studio/fingerprinting/index.ts",
      "packages/fluxiq/src/programs/automation-studio/runtime/llm/models/index.ts",
      "packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/client/index.ts",
      "packages/fluxiq/src/programs/automation-studio/runtime/panel-capabilities/client/index.ts",
      "packages/fluxiq/src/client-gateway/contracts.ts",
      "packages/client-gateway-websocket/src/index.ts",
      "packages/fluxiq/src/ui/index.ts"
    ],
    ownedElsewhere: [],
    browserPackages: []
  },

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

  // References -- module specifiers, string text, property names -- that may
  // appear only in the files an entry allows, for the restricted-references
  // rule. Each entry is { name, imports, strings, names, allow, reason, remedy }.
  //
  // Empty here, which makes the rule inert: Core owns every model provider
  // call, so a provider host, SDK or key name is ordinary in this repository.
  // The downstream web-extension repository lists them, so that a provider
  // call written there fails the build instead of only a Lab network policy.
  restrictedReferences: [],

  // Modules that must never load others through any chain of imports, for the
  // module-reach rule. Each entry is { name, from, to, reason, remedy }; a
  // prefix ending in `/` is a directory, any other names one file. A `from`
  // entry that names no audited script fails, so a rename cannot empty it.
  //
  // Trace content never reaches model guidance (trace plan D36). `from` is the
  // text a model reads: the model-facing words, the system prompt and domain
  // instructions, stage and diagnosis instructions, the node descriptions
  // `core.describe_nodes` returns, the Flow catalogue and script format, the
  // supervisor's instructions and guidance, the conversation prompt, and the
  // trial gates' offline-first words and contract (P6, t769). `to`
  // is everything that holds or replays a recorded gateway trace.
  reachBoundaries: [
    {
      name: "program-independent execution capabilities",
      from: [
        "packages/fluxiq/src/components/automation/",
        "packages/fluxiq/src/flows/executable/",
        "packages/fluxiq/src/engine/automation/",
        "packages/fluxiq/src/runtime/automation-host/",
        "packages/fluxiq/src/runtime/models/",
        "packages/fluxiq/src/runtime/agents/",
        "packages/fluxiq/src/runtime/adapters/",
        "packages/fluxiq/src/runtime/adaptation/",
        "packages/fluxiq/src/runtime/native-execution/",
        "packages/fluxiq/src/runtime/environment/",
        "packages/fluxiq/src/runtime/run-control/",
        "packages/fluxiq/src/runtime/host-resources/",
        "packages/fluxiq/src/runtime/output-dispatch/",
        "packages/fluxiq/src/runtime/state/",
        "packages/fluxiq/src/runtime/recording/",
        "packages/fluxiq/src/runtime/result-verification/",
        "packages/fluxiq/src/client-gateway/recording/",
        "packages/fluxiq/src/runtime/action-permissions/",
        "packages/fluxiq/src/runtime/interaction/",
        "packages/fluxiq/src/runtime/parking/",
        "packages/fluxiq/src/runtime/repeat/",
        "packages/fluxiq/src/runtime/reference-time/",
        "packages/fluxiq/src/runtime/activity/",
        "packages/fluxiq/src/runtime/flow-authoring/",
        "packages/fluxiq/src/runtime/execution-admission/",
        "packages/fluxiq/src/runtime/execution-observation/",
        "packages/fluxiq/src/runtime/target-matching/"
      ],
      to: ["packages/fluxiq/src/programs/automation-studio/"],
      reason: "Reusable runtime capabilities must remain usable without Automation Studio; legacy program APIs delegate toward these owners.",
      remedy: "Move shared contracts into their framework owner or inject the program adapter through an explicit port."
    },
    {
      name: "trace-free model guidance",
      from: [
        "packages/fluxiq/src/programs/automation-studio/runtime/llm/model-facing/",
        "packages/fluxiq/src/programs/automation-studio/runtime/llm/deepseek/system-prompt.ts",
        "packages/fluxiq/src/programs/automation-studio/runtime/llm/provider-task/system-prompt.ts",
        "packages/fluxiq/src/programs/automation-studio/runtime/llm/provider-task/request-messages.ts",
        "packages/fluxiq/src/programs/automation-studio/runtime/llm/anthropic/request.ts",
        "packages/fluxiq/src/programs/automation-studio/runtime/llm/domain-instructions/",
        "packages/fluxiq/src/programs/automation-studio/runtime/llm/diagnosis-instructions.ts",
        "packages/fluxiq/src/programs/automation-studio/runtime/llm/stages/instructions.ts",
        "packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/node-descriptions.ts",
        "packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/catalog.ts",
        "packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/catalog-names.ts",
        "packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/flow-script-format.ts",
        "packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/offline-first/",
        "packages/fluxiq/src/programs/automation-studio/runtime/project-agents/supervisor/system-instructions.ts",
        "packages/fluxiq/src/programs/automation-studio/runtime/project-agents/supervisor/guidance.ts",
        "packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/prompt.ts"
      ],
      to: [
        "packages/fluxiq/src/client-gateway/trace/",
        "packages/fluxiq/src/client-gateway/trace-replay/",
        "packages/fluxiq/src/client-gateway/trace-matcher/",
        "packages/fluxiq/src/programs/automation-studio/runtime/gateway-trace/",
        "packages/fluxiq/src/programs/automation-studio/runtime/service/offline-trial/",
        "packages/fluxiq/src/programs/automation-studio/model/offline-trial/",
        "packages/fluxiq/src/programs/automation-studio/storage/project/gateway-trace/",
        "packages/fluxiq/src/programs/automation-studio/storage/project/gateway-trace-chunk-codec/",
        "packages/fluxiq/src/programs/automation-studio/storage/project/gateway-trace-chunk-rows/",
        "packages/fluxiq/src/programs/automation-studio/storage/project/gateway-trace-rekey/",
        "packages/fluxiq/src/programs/automation-studio/storage/project/gateway-trace-schema/"
      ],
      reason: "A recorded trace holds what one site showed during one build. Once it can flow into the text a model reads, that text can start describing a test site, and a Lab pass stops measuring whether FluxIQ generalises",
      remedy: "Keep guidance built from generic words and the current call's own inputs. If a trace-derived fact must reach the model, pass it as the call's evidence, not through a guidance module's imports."
    }
  ],

  workingDocsDir: "docs/working",
  workingDocsIndexKind: "core"
};
