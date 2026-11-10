import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  architectureSource,
  automationStudioFeaturePath,
  countPattern,
  customEventChannelCounts,
  domainPrivateImportCounts,
  featurePath,
  importSpecifiers,
  mapCounts,
  namedResidualAudit,
  productionSources,
  sourceLineCount,
  stringLiteralCounts,
  testSources,
  type NamedResidualExemption
} from "../architecture-test-helpers";
import { automationStudioViewIds } from "../views/view-registry";

const sources = productionSources();
const tests = testSources();
const sourceByPath = new Map(sources.map((source) => [source.path, source]));

const canonicalViewIds = new Set<string>(automationStudioViewIds);

const canonicalEntryViews = [
  "adaptations/AdaptationsView.tsx",
  "clients/ClientGatewayView.tsx",
  "flow-editor/components/FlowEditorView.tsx",
  "inspector/InspectorView.tsx",
  "instructions/InstructionsView.tsx",
  "problems/ProblemsView.tsx",
  "recordings/RecordingTimelineView.tsx",
  "router/RouterView.tsx",
  "runtime/FlowRunView.tsx",
  "runtime/RunActionLogView.tsx",
  "runtime/RunHistory.tsx",
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
  "conversation",
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
  "adaptations", "authoring", "authorization", "bootstrap", "cache", "clients", "conversation", "data", "datasets", "development", "flow-editor", "graph",
  "hierarchy", "inspector", "instructions", "model", "parameters", "problems",
  "presentation", "project", "recordings", "router", "runtime", "settings", "shared", "state", "stores", "styles",
  "subflows", "sync", "testing", "tests", "views", "workspace"
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

const removedAggregateAndPublisherPaths = [
  "live/useAutomationProjectView.ts",
  "live/useAutomationCanonicalViewInputs.ts",
  "live/view-host/canonical-publishers.tsx",
  "live/view-host/publisher.tsx",
  "live/view-host/input-identity.ts"
] as const;

const removedAggregateAndPublisherModules = new Set([
  "useAutomationProjectView",
  "useAutomationCanonicalViewInputs",
  "canonical-publishers",
  "publisher",
  "input-identity"
]);

const synchronousInteractionPaths = [
  "flow-editor/components/FlowEditorView.tsx",
  "flow-editor/components/FlowGraphCanvas.tsx",
  "flow-editor/components/FlowGraphToolbar.tsx",
  "flow-editor/components/FlowNode.tsx",
  "flow-editor/flow-canvas-interaction-controller.ts",
  "flow-editor/hooks/useFlowEditorCanvasInteractions.ts",
  "flow-editor/hooks/useFlowEditorGraphDocument.ts",
  "hierarchy/controller.ts",
  "presentation/transaction.ts"
] as const;

const diagnosticCustomEventOwners = new Map<string, ReadonlySet<string> | "dynamic-telemetry">([
  ["cache/data-cache.ts", new Set(["automation-studio:cache-metric"])],
  ["development/telemetry.ts", "dynamic-telemetry"],
  ["graph/worker-tasks.ts", new Set(["automation-studio:worker-queue-metric"])],
  ["sync/project-sync.ts", new Set(["automation-studio:change-feed-reconciliation"])]
]);

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

function customEventCreations(source: ReturnType<typeof architectureSource>): Array<string | null> {
  const channels: Array<string | null> = [];
  visitSyntax(source.syntax, (node) => {
    if (!ts.isNewExpression(node) || node.expression.getText(source.syntax) !== "CustomEvent") return;
    const channel = node.arguments?.[0];
    channels.push(channel && (ts.isStringLiteral(channel) || ts.isNoSubstitutionTemplateLiteral(channel))
      ? channel.text
      : null);
  });
  return channels;
}

function stringArgumentsForCall(
  source: ReturnType<typeof architectureSource>,
  functionName: string
): Array<string | null> {
  const values: Array<string | null> = [];
  visitSyntax(source.syntax, (node) => {
    if (!ts.isCallExpression(node) || node.expression.getText(source.syntax) !== functionName) return;
    const argument = node.arguments[0];
    values.push(argument && (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))
      ? argument.text
      : null);
  });
  return values;
}

function renderTimeExternalWrites(source: ReturnType<typeof architectureSource>): string[] {
  const violations: string[] = [];
  const mutationMethods = new Set([
    "patch", "publish", "replace", "setEntity", "setResource", "setSelection", "setState", "transaction"
  ]);
  visitSyntax(source.syntax, (node) => {
    if (!isRenderFunction(node)) return;
    visitRenderBody(node.body, (candidate) => {
      if (!ts.isCallExpression(candidate) || !ts.isPropertyAccessExpression(candidate.expression)) return;
      const method = candidate.expression.name.text;
      const receiver = candidate.expression.expression.getText(source.syntax);
      if (mutationMethods.has(method) && /(?:controller|projectData|runtimeStatus|selection|source|store|this)$/iu.test(receiver)) {
        violations.push(`${source.path}: ${candidate.expression.getText(source.syntax)}`);
      }
    });
  });
  return violations;
}

function isRenderFunction(node: ts.Node): node is ts.FunctionLikeDeclaration {
  if (!ts.isFunctionDeclaration(node)
    && !ts.isFunctionExpression(node)
    && !ts.isArrowFunction(node)
    && !ts.isMethodDeclaration(node)) return false;
  if (ts.isMethodDeclaration(node)) return node.name.getText() === "render";
  if (node.name && ts.isIdentifier(node.name)) return /^[A-Z]/u.test(node.name.text);
  let parent = node.parent;
  while (ts.isCallExpression(parent)
    || ts.isParenthesizedExpression(parent)
    || ts.isAsExpression(parent)
    || ts.isSatisfiesExpression(parent)) {
    parent = parent.parent;
  }
  return ts.isVariableDeclaration(parent)
    && ts.isIdentifier(parent.name)
    && /^[A-Z]/u.test(parent.name.text);
}

function visitRenderBody(node: ts.ConciseBody | undefined, callback: (node: ts.Node) => void): void {
  if (!node) return;
  callback(node);
  node.forEachChild((child) => {
    if (ts.isFunctionLike(child)) return;
    visitRenderBody(child as ts.ConciseBody, callback);
  });
}

function visitSyntax(node: ts.Node, callback: (node: ts.Node) => void): void {
  callback(node);
  node.forEachChild((child) => visitSyntax(child, callback));
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

  it("keeps deleted aggregate-model and publisher modules absent and unimportable", () => {
    expect(removedAggregateAndPublisherPaths.filter((path) => existsSync(featurePath(path)))).toEqual([]);
    const forbiddenImports = [...sources, ...tests].flatMap((source) =>
      importSpecifiers(source).flatMap((specifier) => {
        const moduleName = specifier.split("/").at(-1)?.replace(/.(?:ts|tsx)$/u, "") ?? "";
        return removedAggregateAndPublisherModules.has(moduleName)
          ? [`${source.path}: ${specifier}`]
          : [];
      })
    );
    expect(forbiddenImports).toEqual([]);
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
    const allowed = new Set(["navigation.ts", "live/hooks/useAutomationBrowserEntry.ts"]);
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
      "automation-studio:background-work",
      "automation-studio:change-feed-reconciliation",
      "automation-studio:command-status",
      "automation-studio:dirty-state",
      "automation-studio:graph-metric",
      "automation-studio:performance-counter",
      "automation-studio:preload-metric",
      "automation-studio:subscription-metric",
      "automation-studio:ui-cache-metric",
      "automation-studio:worker-queue-metric"
    ]);
    const current = mapCounts(sources.map((source) => ({
      path: source.path,
      count: customEventChannelCounts(source, diagnosticChannels)
    })));
    expect(namedResidualAudit(current, []).violations).toEqual([]);
  });

  it("confines CustomEvent dispatch to exact diagnostic producers and channels", () => {
    const violations = sources.flatMap((source) => {
      const channels = customEventCreations(source);
      if (!channels.length) return [];
      const ownership = diagnosticCustomEventOwners.get(source.path);
      if (!ownership) return channels.map((channel) => `${source.path}: ${channel ?? "<dynamic>"}`);
      if (ownership === "dynamic-telemetry") {
        return channels.filter((channel) => channel !== null)
          .map((channel) => `${source.path}: expected typed dynamic telemetry, received ${channel}`);
      }
      return channels.filter((channel) => channel === null || !ownership.has(channel))
        .map((channel) => `${source.path}: ${channel ?? "<dynamic>"}`);
    });
    expect(violations).toEqual([]);

    const staleOwners = [...diagnosticCustomEventOwners]
      .filter(([path]) => customEventCreations(architectureSource(path)).length === 0)
      .map(([path]) => path);
    expect(staleOwners).toEqual([]);

    const telemetry = architectureSource("development/telemetry.ts");
    const telemetryChannels = stringArgumentsForCall(telemetry, "emitDevelopmentMetric").sort();
    expect(telemetryChannels).toEqual([
      "automation-studio:graph-metric",
      "automation-studio:subscription-metric",
      "automation-studio:subscription-metric",
      "automation-studio:worker-queue-metric"
    ]);
    expect(telemetry.source).not.toMatch(/export\s+function\s+emitDevelopmentMetric/u);
  });

  it("forbids external controller and store writes during component render", () => {
    expect(sources.flatMap(renderTimeExternalWrites)).toEqual([]);
  });

  it("keeps synchronous navigation, selection, and canvas interactions serialization-free", () => {
    const missing = synchronousInteractionPaths.filter((path) => !sourceByPath.has(path));
    expect(missing).toEqual([]);
    const offenders = synchronousInteractionPaths.flatMap((path) => {
      const source = sourceByPath.get(path);
      return source && /\bJSON\.stringify\s*\(/u.test(source.source) ? [path] : [];
    });
    expect(offenders).toEqual([]);
  });

  it("keeps CSS ownership executable through the import manifest gate", () => {
    const styleGate = featurePath("styles/tests/styles-architecture.test.ts");
    const globals = resolve(automationStudioFeaturePath, "../../app/globals.css");
    const studioManifest = resolve(automationStudioFeaturePath, "../../app/(panel)/flows/[flowId]/graph/graph.css");
    const rootLayout = resolve(automationStudioFeaturePath, "../../app/layout.tsx");
    const studioLayout = resolve(automationStudioFeaturePath, "../../app/(panel)/flows/[flowId]/graph/layout.tsx");
    expect(existsSync(styleGate), "styles architecture gate").toBe(true);
    const lines = readFileSync(globals, "utf8").split(/\r?\n/u).filter(Boolean);
    const studioLines = readFileSync(studioManifest, "utf8").split(/\r?\n/u).filter(Boolean);
    expect(lines.every((line) => /^@import "[^"]+";$/u.test(line))).toBe(true);
    expect(lines.some((line) => line.includes("automation-studio"))).toBe(false);
    expect(studioLines.every((line) => /^@import "[^"]+";$/u.test(line))).toBe(true);
    expect(studioLines.every((line) => line.includes("features/automation-studio/styles/"))).toBe(true);
    expect(readFileSync(rootLayout, "utf8")).not.toContain("@xyflow/react/dist/style.css");
    expect(readFileSync(studioLayout, "utf8")).toContain("@xyflow/react/dist/style.css");
  });

  it("keeps removed compatibility paths absent and residual barrels frozen", () => {
    const removed = [
      "hierarchy/ProjectHierarchySidebar.tsx",
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

    const boundedBarrels = new Map([
      ["hierarchy/model.ts", 5],
      ["views/Renderer.tsx", 15],
      ["workspace/layout.ts", 8]
    ]);
    const oversized = [...boundedBarrels].flatMap(([path, ceiling]) => {
      const lines = existsSync(featurePath(path))
        ? sourceLineCount(readFileSync(featurePath(path), "utf8"))
        : 0;
      return lines > ceiling ? [`${path}: ${lines} > ${ceiling}`] : [];
    });
    expect(oversized).toEqual([]);
  });
});
