import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { automationStudioViewDefinitions } from "../../views";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Phase 8 routed browser suite contract", () => {
  it("covers every required real interaction workflow without setContent fixtures", () => {
    const support = read("e2e/support/app-fixture.ts");
    const hierarchy = read("e2e/phase8-hierarchy-workflows.spec.ts");
    const workspace = read("e2e/phase8-workspace-workflows.spec.ts");
    const resilience = read("e2e/phase8-resilience-workflows.spec.ts");
    for (const source of [hierarchy, workspace, resilience]) {
      expect(source).toContain("openFixtureProject");
      expect(source).not.toContain("page.setContent");
    }
    for (const contract of ["ArrowDown", "ArrowRight", "aria-expanded", "disclosure"]) expect(hierarchy).toContain(contract);
    for (const contract of ["Add tab", "menu", "dialog", "combobox", "separator", "Discard", "toBeFocused"]) expect(workspace).toContain(contract);
    for (const contract of ["Retry", "stale", "dblclick", "Search problems", "dismiss-pairing", "Escape"]) expect(resilience).toContain(contract);
    for (const contract of ["Automation Studio project tree", 'getByRole("tree", { name: "Flows" })', "selectFixtureFlow", "selectFixtureRecording", "data-workspace-region", "openStudioView"]) expect(support).toContain(contract);
    expect(workspace).not.toContain(".automation-tree-row");
  });

  it("inventories all twelve Studio views and all nine global programs with axe", () => {
    const source = read("e2e/phase8-accessibility-matrix.spec.ts");
    // Read from the registry rather than keeping a second copy of the twelve
    // names. A hand-written list survived the 2026-09-28 rename untouched while
    // every selector in the suite went stale, because it only ever compared one
    // stale list against another. Deriving it means renaming a view fails this
    // test until the browser suite is updated too, which is the point of it.
    const labels = automationStudioViewDefinitions().map((definition) => definition.label);
    expect(labels).toHaveLength(12);
    for (const view of labels) {
      expect(source, `the accessibility matrix must cover the "${view}" view`).toContain(`"${view}"`);
    }
    // The e2e helpers resolve a view by its visible name, so the union they take
    // has to hold the registry's labels and nothing else.
    const union = read("e2e/support/app-fixture.ts").split("export type StudioViewTitle =")[1]?.split(";")[0] ?? "";
    for (const view of labels) expect(union, `StudioViewTitle must list "${view}"`).toContain(`"${view}"`);
    for (const program of ["automation-studio", "background-tasks", "compute-control", "database-manager", "deployment-sync", "docs", "identity-access", "production-runner", "secret-keys"]) {
      expect(source).toContain(`"${program}"`);
    }
    expect(read("e2e/support/accessibility.ts")).toContain("AxeBuilder");
    expect(source).toContain("selects the canonical recording through the accessible project hierarchy");
    expect(source).not.toContain("page.setContent");
  });

  it("keeps the performance protocol and persisted fixture verification fail closed", () => {
    const performance = read("e2e/phase8-performance-certification.spec.ts");
    const telemetry = read("e2e/support/performance.ts");
    const seed = read("e2e/support/seed-fixtures.mjs");
    const verify = read("e2e/support/verify-fixtures.mjs");
    for (const evidence of ["collectBrowserHeapUsage", "collectPhase8BrowserResources", "measureAnimationFrameDurations", "renderMetrics", "soakCycles", "updateDepthWarnings"]) {
      expect(performance).toContain(evidence);
    }
    expect(performance).toContain('testInfo.project.name !== "desktop-chromium"');
    expect(seed).toContain("FLUXIQ_E2E_PHASE8_PROFILE");
    expect(seed).toContain("writeNdjson");
    expect(seed).toContain("persistFixtureRecording");
    expect(seed).toContain("phase8RecordingHierarchyNodes");
    expect(seed).toContain("recordingLabels,");
    expect(verify).toContain("verifyPhase8Project");
    expect(verify).toContain("persisted run events");
    expect(verify).toContain("listRecordingSessionSummaryPage");
    expect(verify).toContain("listFlowAdaptationSummaries");
    expect(performance).toContain("new AxeBuilder");
    expect(performance).not.toContain("criticalAccessibilityViolations = 0");
    expect(telemetry).toContain('options?.once === true');
    expect(telemetry).toContain("releaseRegistration(this, key, listener)");
    expect(telemetry).toContain('capture ? "capture" : "bubble"');
  });

  it("selects project-owned Phase 8 recordings by their accessible hierarchy suffix", () => {
    const support = read("e2e/support/app-fixture.ts");
    expect(support).toContain("const ownedPrefix = `recording.${project.id}.`");
    expect(support).toContain("project.recordingLabels?.[recordingIndex] ?? fallbackLabel");
    expect(support).toContain('selectHierarchyObject(page, lookupLabel, "recording", Boolean(project.recordingLabels?.[recordingIndex]))');
    expect(support).not.toContain('recordingId.replace(/^recording[.:_-]?/u, ""), "recording"');
  });

  it("keeps Phase 7 committed goldens Chromium-normalized under the 12-project config", () => {
    const phase7 = read("e2e/phase7-visual-fixture.spec.ts");
    expect(phase7).toContain('!testInfo.project.name.endsWith("-chromium")');
    expect(phase7).toContain("Phase 7 committed goldens are normalized in Chromium");
  });

  it("routes persisted Problems and Docs corpora through production views", () => {
    const source = read("e2e/phase8-corpus-workflows.spec.ts");
    const support = read("e2e/support/app-fixture.ts");
    expect(source).toContain("installPhase8CorpusRoutes");
    expect(source).toContain("100000 indexed pages");
    expect(source).toContain('aria-label="100000 problems"');
    expect(source).not.toContain("page.setContent");
    expect(support).toContain("/api/programs/automation-studio/list-project-problems");
    expect(support).toContain("/api/programs/docs/snapshot");
    expect(support).toContain("/api/programs/docs/get-page");
  });
});
