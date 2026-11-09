// Repository-specific configuration for structure-audit. This is the only
// file that differs between FluxIQ Core and the downstream web-extension
// repository; the entry point, context, baseline, and rules are mirrored.

import { readdirSync } from "node:fs";

// Every directory under programs/, for the boundary that keeps the framework from importing one.
const programDirectories = readdirSync(new URL("../../packages/fluxiq/src/programs/", import.meta.url), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

export const CONFIG = {
  repository: "core",

  // Directories whose basename marks a test root. Test files must live
  // directly inside one of these. "e2e" is a runner-owned root, not
  // co-location.
  testRootDirNames: ["tests", "e2e"],

  // Import specifiers that must never appear in this repository's sources.
  forbiddenImports: [
    {
      from: "packages/fluxiq/src/runtime",
      pattern: /(?:programs\/automation-studio|^fluxiq\/automation(?:-studio)?(?:\/|$))/,
      reason: "The framework runtime owns generic execution contracts. Import @fluxiq/contracts/runtime; Automation Studio adapts to the framework runtime, never the reverse."
    },
    {
      from: "packages/fluxiq/src/components/automation",
      pattern: /^(?:@fluxiq\/contracts|fluxiq)\/automation(?:-studio)?(?:\/|$)/,
      reason: "Framework nodes use neutral runtime, records and recording-capture contracts, without a Studio dependency."
    },
    {
      from: "packages/fluxiq/src/engine/automation",
      pattern: /^(?:@fluxiq\/contracts|fluxiq)\/automation(?:-studio)?(?:\/|$)/,
      reason: "Graph execution uses neutral runtime and record contracts, without a Studio dependency."
    },
    {
      from: "packages/fluxiq/src/flows/executable",
      pattern: /^(?:@fluxiq\/contracts|fluxiq)\/automation(?:-studio)?(?:\/|$)/,
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
    ...["api-contracts", "client-gateway", "core", "domains", "flows", "framework", "io", "platform", "runtime", "ui"].map((area) => ({
      from: `packages/fluxiq/src/${area}`,
      to: "packages/fluxiq/src/programs/automation-studio",
      reason: "Automation Studio is a controller of the framework (user, 2026-11-02), so the framework never depends on it. Only the program catalog composes it."
    })),
    // The dependency points from a program to the framework, never back. Backend
    // code a program shares with the framework (repositories, program state,
    // performance metrics, ports the framework implements) lives in
    // `framework/persistence` or the area that owns it. The program catalog,
    // `programs/index.ts`, is the one file that composes programs, so it is the
    // only target outside this list. Tests count: a test that needs a real
    // program beside a framework subject lives in `src/tests/`.
    ...["api-contracts", "client-gateway", "core", "domains", "flows", "framework", "io", "runtime", "ui"].flatMap((area) =>
      programDirectories.map((program) => ({
        from: `packages/fluxiq/src/${area}`,
        to: `packages/fluxiq/src/programs/${program}`,
        reason: "A program depends on the framework, never the reverse (user, 2026-11-02). Move what the framework needs to its owner, such as framework/persistence, or declare a port on the framework side that the program satisfies; only the program catalog, programs/index.ts, composes programs. A test that needs a real program lives in packages/fluxiq/src/tests."
      }))
    ),
    {
      from: "packages/fluxiq/src/runtime/automation-host",
      to: "packages/fluxiq/src/engine/automation",
      reason: "Host ports own the contracts consumed by the engine; they cannot depend back on the executor."
    },
    {
      from: "packages/fluxiq/src/runtime/llm",
      to: "packages/fluxiq/src/runtime/adaptation/recovery",
      valueOnly: true,
      reason: "runtime/llm must not import a value out of runtime/recovery: recovery drives the evidence loop out of runtime/llm, so the return edge closes a module cycle and a constant read at module-evaluation time arrives undefined with a clean type check. Import the type if that is what you need, call the value from the coordinator that already owns both sides, or move the shared value into runtime/loop-limits/, which neither directory owns."
    }
  ],

  // Programs that only control the framework, for the program-controllers rule:
  // what each may hold, and the line budget past which a function has logic in it.
  controllerPrograms: [
    {
      path: "packages/fluxiq/src/programs/automation-studio",
      allowed: ["api", "ui", "index.ts", "metadata.ts"],
      maxFunctionLines: 20,
      reason: "Automation Studio is a controller of the framework (user, 2026-11-02)."
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
      "packages/fluxiq/src/runtime/output-dispatch/preparation/index.ts",
      "packages/fluxiq/src/framework/automation-service/nodes/index.ts",
      "packages/fluxiq/src/framework/automation-service/nodes/action-effect/index.ts",
      "packages/fluxiq/src/framework/automation-service/actionability/index.ts",
      "packages/fluxiq/src/runtime/target-matching/fingerprinting/index.ts",
      "packages/fluxiq/src/runtime/llm/models/index.ts",
      "packages/fluxiq/src/runtime/action-permission-requests/client/index.ts",
      "packages/fluxiq/src/framework/automation-service/panel-capabilities/client/index.ts",
      "packages/fluxiq/src/client-gateway/contracts.ts",
      "packages/contracts/src/automation.ts",
      "packages/contracts/src/fluxnode.ts",
      "packages/client-gateway-websocket/src/index.ts",
      "packages/fluxiq/src/ui/index.ts",
      "packages/ui-components/src/index.ts",
      "packages/ui-components/src/dom/index.ts",
      "packages/ui-components/src/icons/index.ts"
    ],
    ownedElsewhere: [],
    browserPackages: ["zod"]
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
      path: "packages/fluxiq/src/framework/automation-service/service/datasets",
      reason: "the run datasets collaborator builds the store batches, audit events, and export answers that dataset endpoints return",
      remedy: "Write each field by name, passing an absent optional field as `undefined`."
    },
    {
      // The permission request is what a person grants or refuses from, and
      // the gate is the one place it is built. A field that stopped arriving --
      // the consequence, the control's name -- would ask a person a question
      // they cannot answer, with every gate green.
      path: "packages/fluxiq/src/runtime/action-permission-requests",
      reason: "the action-permission gate builds the request a run carries out to a person, and the grant's permission set",
      remedy: "Write each field by name, passing an absent value as `null`."
    }
  ],

  // Path prefixes whose source must stay neutral about any single domain: the
  // web-vocabulary rule reads every name declared or read under them and fails
  // on a web or DOM word that is not already baselined.
  //
  // `packages/` is nearly the whole of it, and deliberately so. It is what a domain
  // repository installs and imports, so a web word that lands there becomes a
  // field every other domain carries. `apps/web` is out: it is Core's own
  // Next.js interface, and a React component legitimately owns a class name, a
  // click handler and a scroll container -- that is the DOM used as a UI
  // toolkit, not Core learning one domain's vocabulary. `scripts/` is out for
  // the same reason; the docs-links rule parses HTML anchors because Markdown
  // contains them.
  //
  // `packages/ui-components` is out for the reason `apps/web` is: it is Core's chat
  // UI drawn with the DOM, the DOM used as a UI toolkit, and it depends on Core,
  // never the reverse, so no domain's contract carries its words. Every other
  // package counts, so a new one is checked without anyone remembering to add it.
  domainNeutralPaths: readdirSync(new URL("../../packages/", import.meta.url), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "ui-components")
    .map((entry) => `packages/${entry.name}`),

  // What may still spell a browser's field or notation in Core's source, for the
  // web-vocabulary rule, each with the terms it may hold and why. Everything else in
  // the neutral paths is held to none: a new reader fails the build, and belongs in
  // the domain behind a hook on its implementation bundle (`nodes/importer-sdk.ts`).
  // A path ending in `/` is a directory. An entry that holds none of its terms any
  // more fails, so this list can only shrink.
  domainReadingExceptions: [
    // Safety screens: Core's rule over what reaches a model, applied whether or not a
    // domain is bound. Moving a token out could only let less be screened.
    { path: "packages/fluxiq/src/runtime/llm/screening/locator-text.ts", terms: ["testid"],
      reason: "Screens address notation out of text on its way to a provider. A neutral pattern would change what the model is sent; a shorter one would screen less. Lead's decision, t851." },
    { path: "packages/fluxiq/src/runtime/adaptation/recovery/context.ts", terms: ["selector"],
      reason: "A deny-list of keys a domain's state may not carry into a repair's context. Denies only; reads no field." },
    { path: "packages/fluxiq/src/runtime/native-nodes/native-node-runtime.ts", terms: ["password"],
      reason: "Redacts secret-named keys from a native node's log. Denies only." },
    { path: "packages/fluxiq/src/runtime/llm/model-facing/control-text.ts", terms: ["selector"],
      reason: "Screens words that only ever say how a control is found out of what a model reads. Denies only." },
    { path: "packages/fluxiq/src/runtime/llm/harness/throw-screen.ts", terms: ["password"],
      reason: "Screens header-shaped secrets out of a thrown message before a model reads it. Denies only." },
    { path: "packages/fluxiq/src/framework/persistence/automation/project/reusable-llm-context-store.ts", terms: ["password"],
      reason: "Refuses secret-named keys in a stored context. Denies only." },
    { path: "packages/fluxiq/src/runtime/conversations/instructions/invocation.ts", terms: ["password"],
      reason: "Withholds a secret-named argument from a conversation. Denies only." },
    { path: "packages/fluxiq/src/runtime/conversations/instructions/respond.ts", terms: ["password"],
      reason: "Leaves a secret-named argument out of what a reply reports. Denies only." },
    { path: "packages/fluxiq/src/runtime/activity/text/human-label.ts", terms: ["css"],
      reason: "Screens a generated styling class out of what a person reads as a label. Denies only." },
    // Core's own target scoring, by decision.
    { path: "packages/fluxiq/src/runtime/target-matching/", terms: ["visible text", "accessible name", "test id", "selector", "xpath"],
      reason: "Scores a fingerprint against candidates by neutral default weights a domain may replace. Core's decision, t842." },
    // The opaque address Core carries and never reads (Phase T).
    { path: "packages/contracts/src/automation.ts", terms: ["selector"], reason: "A contract's opaque field. Carried, never read." },
    { path: "packages/fluxiq/src/flows/authoring/model/action-element-target.ts", terms: ["visible text", "accessible name", "test id", "selector", "xpath"],
      reason: "Passive types for a recorded target (t847). Declares the shape; holds no reading." },
    { path: "packages/fluxiq/src/flows/authoring/model/actions.ts", terms: ["selector"], reason: "An action's opaque field. Carried, never read." },
    // `selector` as a member of a published enum a domain answers with.
    { path: "packages/fluxiq/src/flows/authoring/model/state.ts", terms: ["selector"], reason: "A member of the published StateElementKind, which a domain declares. Renaming it is a contract change." },
    { path: "packages/fluxiq/src/framework/automation-service/service/evidence/state-elements.ts", terms: ["selector"], reason: "Ranks the published StateElementKind member. Never decides a path is one." },
    { path: "packages/fluxiq/src/framework/automation-service/service/evidence/correlations.ts", terms: ["selector"], reason: "Weighs the published StateElementKind member. Never decides a path is one." },
    { path: "packages/fluxiq/src/framework/automation-service/service/summaries/host-target-resolution.ts", terms: ["selector"],
      reason: "A closed allow-list that admits a host's reported strategy into a run record and drops anything else. Reads no field. Moving it needs a design: its only caller is runtimeSessionToFlowRunDetail, a pure conversion that also runs when a stored run is read back, with no domain in hand." },
    // A person's account password, and secret-named keys: credentials, not a control's field.
    { path: "packages/contracts/src/platform/", terms: ["password"], reason: "Account credentials." },
    { path: "packages/fluxiq/src/platform/provisioning/", terms: ["password"], reason: "Account credentials." },
    { path: "packages/fluxiq/src/platform/store/types.ts", terms: ["password"], reason: "Account credentials." },
    { path: "packages/fluxiq/src/programs/_shared/password-kdf/", terms: ["password"], reason: "Account credentials." },
    { path: "packages/fluxiq/src/programs/database-manager/api/", terms: ["password"], reason: "A database connection's credentials." },
    { path: "packages/fluxiq/src/programs/identity-access/", terms: ["password"], reason: "Account credentials." },
    { path: "packages/fluxiq/src/programs/secret-keys/", terms: ["password"], reason: "Account credentials." },
    { path: "packages/fluxiq/src/runtime/flow-authoring/candidate-start-hook/from-environment.ts", terms: ["password"], reason: "A deployment's start-hook credential, from its environment." },
    { path: "packages/fluxiq/src/runtime/loop-limits/secret-named-key.ts", terms: ["password"], reason: "Recognises secret-named keys so a value under one is withheld. Denies only." }
  ],

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
        "packages/fluxiq/src/runtime/output-dispatch/",
        "packages/fluxiq/src/runtime/target-matching/"
      ],
      to: ["packages/fluxiq/src/programs/automation-studio/"],
      reason: "Reusable runtime capabilities must remain usable without Automation Studio; legacy program APIs delegate toward these owners.",
      remedy: "Move shared contracts into their framework owner or inject the program adapter through an explicit port."
    },
    {
      name: "trace-free model guidance",
      from: [
        "packages/fluxiq/src/runtime/llm/model-facing/",
        "packages/fluxiq/src/runtime/llm/deepseek/system-prompt.ts",
        "packages/fluxiq/src/runtime/llm/provider-task/system-prompt.ts",
        "packages/fluxiq/src/runtime/llm/provider-task/request-messages.ts",
        "packages/fluxiq/src/runtime/llm/anthropic/request.ts",
        "packages/fluxiq/src/runtime/llm/domain-instructions/",
        "packages/fluxiq/src/runtime/llm/diagnosis-instructions.ts",
        "packages/fluxiq/src/runtime/llm/stages/instructions.ts",
        "packages/fluxiq/src/runtime/llm/node-tools/node-descriptions.ts",
        "packages/fluxiq/src/runtime/flow-authoring/bootstrap/plan/catalog.ts",
        "packages/fluxiq/src/runtime/flow-authoring/bootstrap/plan/catalog-names.ts",
        "packages/fluxiq/src/runtime/flow-authoring/bootstrap/plan/flow-script-format.ts",
        "packages/fluxiq/src/runtime/flow-authoring/bootstrap/offline-first/",
        "packages/fluxiq/src/runtime/project-agents/supervisor/system-instructions.ts",
        "packages/fluxiq/src/runtime/project-agents/supervisor/guidance.ts",
        "packages/fluxiq/src/runtime/conversations/instructions/prompt.ts"
      ],
      to: [
        "packages/fluxiq/src/client-gateway/trace/",
        "packages/fluxiq/src/client-gateway/trace-replay/",
        "packages/fluxiq/src/client-gateway/trace-matcher/",
        "packages/fluxiq/src/runtime/recording/gateway-trace/",
        "packages/fluxiq/src/framework/automation-service/service/offline-trial/",
        "packages/fluxiq/src/flows/authoring/model/offline-trial/",
        "packages/fluxiq/src/framework/persistence/automation/project/gateway-trace/",
        "packages/fluxiq/src/framework/persistence/automation/project/gateway-trace-chunk-codec/",
        "packages/fluxiq/src/framework/persistence/automation/project/gateway-trace-chunk-rows/",
        "packages/fluxiq/src/framework/persistence/automation/project/gateway-trace-rekey/",
        "packages/fluxiq/src/framework/persistence/automation/project/gateway-trace-schema/"
      ],
      reason: "A recorded trace holds what one site showed during one build. Once it can flow into the text a model reads, that text can start describing a test site, and a Lab pass stops measuring whether FluxIQ generalises",
      remedy: "Keep guidance built from generic words and the current call's own inputs. If a trace-derived fact must reach the model, pass it as the call's evidence, not through a guidance module's imports."
    }
  ],

  workingDocsDir: "docs/working",
  workingDocsIndexKind: "core"
};
