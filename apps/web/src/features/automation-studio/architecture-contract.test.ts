import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  architectureSource,
  automationStudioFeaturePath,
  callCount,
  countPattern,
  customEventChannelCounts,
  domainPrivateImportCounts,
  featurePath,
  functionSpans,
  importSpecifiers,
  jsxElementCount,
  jsxTagCounts,
  mapCounts,
  namedResidualAudit,
  productionSources,
  sourceLineCount,
  stringLiteralCounts,
  testSources,
  type NamedResidualExemption
} from "./architecture-test-helpers";
import { automationStudioViewIds } from "./views/view-registry";

const sources = productionSources();
const tests = testSources();
const sourceByPath = new Map(sources.map((source) => [source.path, source]));

const canonicalViewIds = new Set<string>(automationStudioViewIds);

const canonicalEntryViews = [
  "adaptations/AdaptationsView.tsx",
  "clients/ClientGatewayView.tsx",
  "flow-editor/FlowEditorView.tsx",
  "inspector/InspectorView.tsx",
  "instructions/InstructionsView.tsx",
  "problems/ProblemsView.tsx",
  "recordings/RecordingTimelineView.tsx",
  "router/RouterView.tsx",
  "runtime/FlowRunView.tsx",
  "runtime/RunActionLogView.tsx",
  "runtime/RuntimeDebugView.tsx",
  "settings/FlowSettingsView.tsx",
  "settings/SettingsViews.tsx",
  "settings/SubflowSettingsView.tsx",
  "state/StateExplorerView.tsx",
  "subflows/SubflowsView.tsx"
] as const;

const canonicalViewIdOwners = new Set([
  "views/canonical-view-definitions.tsx",
  "views/retired-view-migrations.ts",
  "views/view-migrations.ts"
]);

const productDomains = new Set([
  "adaptations",
  "clients",
  "flow-editor",
  "hierarchy",
  "inspector",
  "instructions",
  "problems",
  "recordings",
  "router",
  "runtime",
  "settings",
  "state",
  "subflows"
]);

const approvedTopLevelDirectories = [
  "adaptations", "cache", "clients", "data", "development", "flow-editor", "graph",
  "hierarchy", "inspector", "instructions", "live", "model", "parameters", "problems",
  "project", "recordings", "router", "runtime", "settings", "shared", "state", "stores", "styles",
  "subflows", "sync", "testing", "views", "workspace"
] as const;
const directApiResiduals: NamedResidualExemption[] = [];

const rawViewIdResiduals: NamedResidualExemption[] = [];

const domainPrivateImportResiduals: NamedResidualExemption[] = [
];

const urlViewStateResiduals: NamedResidualExemption[] = [
  debt("model/live-helpers.ts", 2, "Phase 8 browser-neutral navigation", "Phase 8"),
];

const proposalCreationResiduals: NamedResidualExemption[] = [
];

function rawCanonicalViewBoundaryCount(source: ReturnType<typeof architectureSource>): number {
  const nonCollidingIds = new Set([...canonicalViewIds].filter((id) => id !== "adaptations"));
  const adaptationBoundaryCount = countPattern(
    source.source,
    /(?:canonicalViewId|viewId|activeViewId|requestedViewId|openView|view)\s*(?::|=|\()\s*["']adaptations["']/gu
  );
  return stringLiteralCounts(source, nonCollidingIds) + adaptationBoundaryCount;
}
function debt(path: string, ceiling: number, owner: string, removalPhase: string): NamedResidualExemption {
  return { path, ceiling, owner, removalPhase };
}

describe("Automation Studio Phase 10I architecture enforcement", () => {
  it("keeps canonical entry views off direct Program API ownership", () => {
    expect(canonicalEntryViews.filter((path) => !sourceByPath.has(path))).toEqual([]);
    const current = mapCounts(canonicalEntryViews.map((path) => {
      const source = sourceByPath.get(path);
      return {
        path,
        count: source
          ? countPattern(source.source, /(?:useProgramApi\s*\(|\bapi\.(?:get|post)\s*\()/u)
            + importSpecifiers(source).filter((specifier) => specifier.endsWith("/program-api")).length
          : 0
      };
    }));
    expect(namedResidualAudit(current, directApiResiduals).violations).toEqual([]);
  });

  it("forbids generic root dumping-ground implementations", () => {
    const forbidden = [
      "AutomationStudioHelpers.ts",
      "AutomationStudioModals.tsx",
      "AutomationStudioViews.tsx",
      "types.ts",
      "views/AllViews.tsx",
      "views/GraphEditorViews.tsx",
      "views/WorkspaceViews.tsx",
      "workspace/WorkspaceViews.tsx"
    ];
    const genericRootBuckets = sources
      .map((source) => source.path)
      .filter((path) => /^(?:AutomationStudio(?:Controllers|Helpers|Hooks|Modals|State|Utils|Views)|views\/(?:All|Automation|GraphEditor|Workspace)Views|workspace\/WorkspaceViews)\.(?:ts|tsx)$/u.test(path));
    expect([...new Set([...forbidden.filter((path) => existsSync(featurePath(path))), ...genericRootBuckets])]).toEqual([]);
  });

  it("keeps top-level feature taxonomy explicit and closed", () => {
    const actual = readdirSync(automationStudioFeaturePath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(actual).toEqual([...approvedTopLevelDirectories].sort());
  });
  it("forbids the retired generic controllers directory and imports", () => {
    expect(existsSync(featurePath("controllers"))).toBe(false);
    const controllerImports = [...sources, ...tests].flatMap((source) =>
      importSpecifiers(source)
        .filter((specifier) => /(?:^|\/)controllers(?:\/|$)/u.test(specifier))
        .map((specifier) => source.path + ": " + specifier)
    );
    expect(controllerImports).toEqual([]);
  });

  it("centralizes raw canonical view IDs in registry and migration owners", () => {
    const current = mapCounts(sources
      .filter((source) => !canonicalViewIdOwners.has(source.path))
      .map((source) => ({ path: source.path, count: rawCanonicalViewBoundaryCount(source) })));
    expect(namedResidualAudit(current, rawViewIdResiduals).violations).toEqual([]);
  });

  it("keeps canonical host, publisher, and functionality registration definition-driven", () => {
    const contracts = architectureSource("live/view-host/contracts.ts").source;
    const publishers = architectureSource("live/view-host/canonical-publishers.tsx").source;
    const hostTypes = architectureSource("views/view-host-types.ts").source;
    const hostRegistry = architectureSource("views/view-host-registry.tsx").source;
    const viewContracts = architectureSource("views/view-contracts.ts").source;

    expect(contracts).not.toContain("canonicalViewHostKinds");
    expect(hostRegistry).not.toContain("registrationList");
    expect(hostTypes).not.toMatch(/AutomationViewHostBindingMap\s*=\s*\{/u);
    expect(publishers).not.toMatch(/automationStudioViewId\./u);
    expect(viewContracts).toContain("automationStudioViewDefinitionsList.map");
  });
  it("forbids imports of sibling domain-private modules", () => {
    const current = domainPrivateImportCounts(sources, productDomains);
    expect(namedResidualAudit(current, domainPrivateImportResiduals).violations).toEqual([]);
  });

  it("enforces the hard 700-line production ceiling without debt", () => {
    const oversized = sources
      .filter((source) => sourceLineCount(source.source) > 700)
      .map((source) => source.path + ": " + sourceLineCount(source.source));
    expect(oversized).toEqual([]);
  });

  it("enforces a hard 900-line test ceiling without named debt", () => {
    const oversized = tests
      .filter((source) => sourceLineCount(source.source) > 900)
      .map((source) => source.path + ": " + sourceLineCount(source.source));
    expect(oversized).toEqual([]);
  });
  it("prevents retired Proposal views from being imported or constructed canonically", () => {
    const forbiddenFiles = [
      "views/ProposalGeneratorView.tsx",
      "views/ProposalView.tsx"
    ];
    expect(forbiddenFiles.filter((path) => existsSync(featurePath(path)))).toEqual([]);

    const migrationFiles = new Set(["hierarchy/routing.ts"]);
    const current = mapCounts(sources
      .filter((source) => !migrationFiles.has(source.path))
      .map((source) => {
        const importCount = importSpecifiers(source)
          .filter((specifier) => /Proposal(?:Generator)?View$/u.test(specifier)).length;
        const creationCount = countPattern(source.source, /(?:kind|type|id)\s*:\s*["']proposal(?:-generator|-workbench)?["']/u);
        return { path: source.path, count: importCount + creationCount };
      }));
    expect(namedResidualAudit(current, proposalCreationResiduals).violations).toEqual([]);
  });

  it("keeps ordinary view state out of browser URLs", () => {
    const allowed = new Set(["navigation.ts", "live/useAutomationBrowserEntry.ts"]);
    const current = mapCounts(sources
      .filter((source) => !allowed.has(source.path))
      .map((source) => ({
        path: source.path,
        count: countPattern(source.source, /(?:\?view=|useSearchParams\s*\(|window\.location\.search|\.get\(\s*["']view["']\s*\))/u)
      })));
    expect(namedResidualAudit(current, urlViewStateResiduals).violations).toEqual([]);
  });

  it("forbids direct browser persistence in view components", () => {
    const current = sources
      .filter((source) => source.path.endsWith(".tsx"))
      .filter((source) => /(?:localStorage|sessionStorage|indexedDB)\b/u.test(source.source))
      .map((source) => source.path);
    expect(current).toEqual([]);
  });

  it("forbids global CustomEvent mutation and action channels", () => {
    const forbiddenChannels = new Set([
      "automation-studio:activate-mounted-view",
      "automation-studio:capture-node-viewport",
      "automation-studio:delete-edge",
      "automation-studio:delete-node",
      "automation-studio:focus-graph-problem",
      "automation-studio:focus-node-palette",
      "automation-studio:global-save",
      "automation-studio:restore-node-viewport",
      "automation-studio:run-flow",
      "automation-studio:runtime-control",
      "automation-studio:select-edge",
      "automation-studio:update-node-parameters",
      "fluxiq:flow-settings-changed",
      "fluxiq:instructions-changed",
      "fluxiq:runtime-runs-changed",
      "fluxiq:subflows-changed"
    ]);
    const current = mapCounts(sources.map((source) => ({
      path: source.path,
      count: stringLiteralCounts(source, forbiddenChannels)
    })));
    expect(namedResidualAudit(current, []).violations).toEqual([]);
  });

  it("rejects renamed global Studio action channels outside diagnostic owners", () => {
    const diagnosticChannels = new Set([
      "automation-studio:cache-metric",
      "automation-studio:change-feed-reconciliation",
      "automation-studio:command-status",
      "automation-studio:dirty-state",
      "automation-studio:graph-metric",
      "automation-studio:performance-counter",
      "automation-studio:preload-metric",
      "automation-studio:subscription-metric",
      "automation-studio:worker-queue-metric"
    ]);
    const current = mapCounts(sources.map((source) => ({
      path: source.path,
      count: customEventChannelCounts(source, diagnosticChannels)
    })));
    expect(namedResidualAudit(current, []).violations).toEqual([]);
  });
  it("keeps AutomationStudioLive a bounded composition root without debt", () => {
    const root = architectureSource("AutomationStudioLive.tsx");
    const functions = functionSpans(root);
    const programApiCalls = callCount(root, (expression) => {
      const text = expression.getText(root.syntax);
      return text === "useProgramApi" || text === "api.get" || text === "api.post";
    });
    const stateCalls = callCount(root, (expression) => ["useState", "useReducer"].includes(expression.getText(root.syntax)));
    const forbiddenJsx = [...jsxTagCounts(root, /(?:Modal|Pane|ProjectTree|Graph|Timeline|Palette|Drawer)/u).values()]
      .reduce((total, count) => total + count, 0);

    expect(sourceLineCount(root.source)).toBeLessThanOrEqual(250);
    expect(Math.max(0, ...functions.map((entry) => entry.lines))).toBeLessThanOrEqual(40);
    expect(programApiCalls).toBe(0);
    expect(jsxElementCount(root)).toBe(0);
    expect(forbiddenJsx).toBe(0);
    expect(stateCalls).toBe(0);
  });

  it("keeps CSS ownership executable through the import manifest gate", () => {
    const styleGate = featurePath("styles/styles-architecture.test.ts");
    const globals = resolve(automationStudioFeaturePath, "../../app/globals.css");
    expect(existsSync(styleGate)).toBe(true);
    const lines = readFileSync(globals, "utf8").split(/\r?\n/u).filter(Boolean);
    expect(lines.every((line) => /^@import "[^"]+";$/u.test(line))).toBe(true);
    expect(lines.some((line) => line.includes("features/automation-studio/styles/"))).toBe(true);
  });

  it("keeps removed compatibility paths absent and residual barrels frozen", () => {
    const removed = [
      "legacy/routines/AutomationRoutineView.tsx",
      "views/selection-channel.ts",
      "graph/view-model.ts",
      "state/view-model.ts",
      "views/GraphEditorViews.tsx",
      "views/ProposalGeneratorView.tsx",
      "views/ProposalView.tsx",
      "views/StateView.tsx",
      "views/WorkspaceViews.tsx"
    ];
    expect(removed.filter((path) => existsSync(featurePath(path)))).toEqual([]);

    const residuals = [
      debt("hierarchy/model.ts", 5, "Phase 7 hierarchy root adoption", "Phase 7"),
      debt("views/Renderer.tsx", 15, "Phase 10H typed host adoption", "Phase 10H"),
      debt("workspace/components.tsx", 8, "Phase 8 workspace shell extraction", "Phase 8"),
      debt("workspace/layout.ts", 8, "Phase 8 workspace shell extraction", "Phase 8")
    ];
    const current = new Map(residuals.map((entry) => [
      entry.path,
      existsSync(featurePath(entry.path)) ? sourceLineCount(readFileSync(featurePath(entry.path), "utf8")) : 0
    ]));
    expect(namedResidualAudit(current, residuals).violations).toEqual([]);
  });
});
