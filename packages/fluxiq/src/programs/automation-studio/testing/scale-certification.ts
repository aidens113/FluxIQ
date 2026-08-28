import { createHash } from "node:crypto";
import { AUTOMATION_STUDIO_SCALE_PROFILES, AUTOMATION_STUDIO_TARGET_SCALE, createAutomationStudioScaleManifest, scaleProfile, type AutomationStudioScaleProfile } from "./scale-fixtures.ts";

export const AUTOMATION_STUDIO_SCALE_CERTIFICATION_SCHEMA_VERSION = "0.1" as const;

export type AutomationStudioScaleCertificationStatus = "passed" | "failed" | "not-run" | "blocked";

export type AutomationStudioScaleCertificationGateId =
  | "scale-matrix"
  | "stream-subscription-soak"
  | "crash-injection"
  | "heap-retention"
  | "query-payload-budgets"
  | "backup-restore-replay"
  | "documentation"
  | "feature-flag-removal";

export type AutomationStudioScaleCertificationMeasurement = {
  elapsedMs: number;
  responseBytes: number;
  resultCount?: number;
  p95Ms?: number;
};

export type AutomationStudioScaleMatrixRun = {
  name: string;
  profile: AutomationStudioScaleProfile;
  operationMeasurements: Record<string, AutomationStudioScaleCertificationMeasurement>;
};

export type AutomationStudioSoakEvidence = {
  runtimeAppendHours: number;
  recordingAppendHours: number;
  subscriptionHours: number;
  runtimeEventsAppended: number;
  recordingEventsAppended: number;
  maxAppendP95Ms: number;
  droppedEvents: number;
  reconnects: number;
};

export type AutomationStudioCrashInjectionEvidence = {
  scenario: "graph-write" | "stream-write" | "object-write" | "migration";
  attempts: number;
  recoveredAttempts: number;
  integrityCheckPassed: boolean;
  orphanedMutableRows: number;
  orphanedStagedFiles: number;
};

export type AutomationStudioHeapSwitchEvidence = {
  switches: number;
  maxRetainedHeapMiB: number;
  maxSingleTaskMs: number;
  longTaskCount: number;
};

export type AutomationStudioCriticalQueryEvidence = {
  name: string;
  expectedIndex: string;
  plan: string;
  fullScan: boolean;
  elapsedMs: number;
  elapsedBudgetMs: number;
  payloadBytes: number;
  payloadBudgetBytes: number;
};

export type AutomationStudioBackupReplayEvidence = {
  backupId: string;
  restoredProjectDigest: string;
  sourceProjectDigest: string;
  compiledPlanDigest: string;
  replayedPlanDigest: string;
  replayTraceDigest: string;
  expectedTraceDigest: string;
};

export type AutomationStudioDocumentationEvidence = {
  authoredDocs: string[];
  generatedDocsChecked: boolean;
  generatedDocsCommand: string;
  operationsRunbookPath: string;
  importingRepoDocPath: string;
  architectureDocPath: string;
};

export type AutomationStudioFeatureFlagEvidence = {
  flag: string;
  owner: string;
  removed: boolean;
  removalGate: AutomationStudioScaleCertificationGateId;
  notes?: string;
};

export type AutomationStudioScaleCertificationInput = {
  generatedAt: string;
  hardware: {
    machine: string;
    os: string;
    cpu: string;
    memoryGiB: number;
    nodeVersion: string;
    sqliteVersion?: string;
  };
  config: {
    projectDatabaseMode: "sqlite-wal";
    browser: string;
    webBuildMode: "development" | "production";
    featureFlags: Record<string, boolean>;
  };
  scaleMatrix?: AutomationStudioScaleMatrixRun[];
  soaks?: AutomationStudioSoakEvidence;
  crashInjection?: AutomationStudioCrashInjectionEvidence[];
  heapRetention?: AutomationStudioHeapSwitchEvidence;
  criticalQueries?: AutomationStudioCriticalQueryEvidence[];
  backupReplay?: AutomationStudioBackupReplayEvidence;
  documentation?: AutomationStudioDocumentationEvidence;
  featureFlags?: AutomationStudioFeatureFlagEvidence[];
};

export type AutomationStudioScaleCertificationEvidence = {
  scaleMatrix: AutomationStudioScaleMatrixRun[] | undefined;
  soaks: AutomationStudioSoakEvidence | undefined;
  crashInjection: AutomationStudioCrashInjectionEvidence[] | undefined;
  heapRetention: AutomationStudioHeapSwitchEvidence | undefined;
  criticalQueries: AutomationStudioCriticalQueryEvidence[] | undefined;
  backupReplay: AutomationStudioBackupReplayEvidence | undefined;
  documentation: AutomationStudioDocumentationEvidence | undefined;
  featureFlags: AutomationStudioFeatureFlagEvidence[] | undefined;
};

export type AutomationStudioScaleCertificationGate = {
  gateId: AutomationStudioScaleCertificationGateId;
  phaseStep: "12.1" | "12.2" | "12.3" | "12.4" | "12.5" | "12.6" | "12.7" | "12.8";
  title: string;
  status: AutomationStudioScaleCertificationStatus;
  summary: string;
  blockers: string[];
};

export type AutomationStudioScaleCertificationReport = {
  schemaVersion: typeof AUTOMATION_STUDIO_SCALE_CERTIFICATION_SCHEMA_VERSION;
  generatedAt: string;
  hardware: AutomationStudioScaleCertificationInput["hardware"];
  config: AutomationStudioScaleCertificationInput["config"];
  targetManifestDigest: string;
  overallStatus: AutomationStudioScaleCertificationStatus;
  gates: AutomationStudioScaleCertificationGate[];
  evidenceDigest: string;
  evidence: AutomationStudioScaleCertificationEvidence;
};

export const AUTOMATION_STUDIO_PHASE_12_REQUIRED_DOC_PATHS = Object.freeze({
  architecture: "docs/architecture/automation-studio/persistence.md",
  operations: "docs/operations/automation-studio-scale-certification.md",
  importingRepo: "docs/integrations/automation-studio-importing-repos.md",
  generatedReference: "docs/reference/framework-reference.md"
});

export function createAutomationStudioScaleCertificationReport(input: AutomationStudioScaleCertificationInput): AutomationStudioScaleCertificationReport {
  const gates = [
    evaluateScaleMatrix(input.scaleMatrix),
    evaluateSoaks(input.soaks),
    evaluateCrashInjection(input.crashInjection),
    evaluateHeapRetention(input.heapRetention),
    evaluateCriticalQueries(input.criticalQueries),
    evaluateBackupReplay(input.backupReplay),
    evaluateDocumentation(input.documentation),
    evaluateFeatureFlags(input.featureFlags)
  ];
  const overallStatus = summarizeGateStatuses(gates.map((gate) => gate.status));
  const evidence: AutomationStudioScaleCertificationEvidence = {
    scaleMatrix: input.scaleMatrix,
    soaks: input.soaks,
    crashInjection: input.crashInjection,
    heapRetention: input.heapRetention,
    criticalQueries: input.criticalQueries,
    backupReplay: input.backupReplay,
    documentation: input.documentation,
    featureFlags: input.featureFlags
  };
  return {
    schemaVersion: AUTOMATION_STUDIO_SCALE_CERTIFICATION_SCHEMA_VERSION,
    generatedAt: input.generatedAt,
    hardware: input.hardware,
    config: input.config,
    targetManifestDigest: createAutomationStudioScaleManifest(AUTOMATION_STUDIO_TARGET_SCALE).digest,
    overallStatus,
    gates,
    evidenceDigest: digestJson({ gates, evidence }),
    evidence
  };
}

export function assertAutomationStudioScaleCertificationPasses(report: AutomationStudioScaleCertificationReport): void {
  if (report.overallStatus === "passed") return;
  const blockers = report.gates.flatMap((gate) => gate.status === "passed" ? [] : gate.blockers.map((blocker) => `${gate.phaseStep} ${gate.title}: ${blocker}`));
  throw new Error(`Automation Studio scale certification is ${report.overallStatus}: ${blockers.join("; ")}`);
}

export function createAutomationStudioScaleCertificationTemplate(input: { generatedAt: string; machine?: string; nodeVersion?: string } = { generatedAt: new Date(0).toISOString() }): AutomationStudioScaleCertificationReport {
  return createAutomationStudioScaleCertificationReport({
    generatedAt: input.generatedAt,
    hardware: {
      machine: input.machine ?? "unrecorded",
      os: "unrecorded",
      cpu: "unrecorded",
      memoryGiB: 0,
      nodeVersion: input.nodeVersion ?? "unrecorded"
    },
    config: {
      projectDatabaseMode: "sqlite-wal",
      browser: "unrecorded",
      webBuildMode: "production",
      featureFlags: {}
    }
  });
}

export function createAutomationStudioScaleMatrixTemplate(): AutomationStudioScaleMatrixRun[] {
  return [
    { name: "smoke", profile: AUTOMATION_STUDIO_SCALE_PROFILES.smoke, operationMeasurements: {} },
    { name: "baseline", profile: AUTOMATION_STUDIO_SCALE_PROFILES.baseline, operationMeasurements: {} },
    { name: "target", profile: AUTOMATION_STUDIO_SCALE_PROFILES.target, operationMeasurements: {} }
  ];
}

function evaluateScaleMatrix(scaleMatrix: AutomationStudioScaleMatrixRun[] | undefined): AutomationStudioScaleCertificationGate {
  const blockers: string[] = [];
  if (!scaleMatrix?.length) blockers.push("full smoke, baseline, and target scale matrix evidence has not been attached");
  const names = new Set((scaleMatrix ?? []).map((run) => run.name));
  for (const required of ["smoke", "baseline", "target"]) {
    if (!names.has(required)) blockers.push(`${required} matrix row is missing`);
  }
  for (const run of scaleMatrix ?? []) {
    const operationNames = Object.keys(run.operationMeasurements);
    if (!operationNames.length) blockers.push(`${run.name} has no operation measurements`);
    for (const [operation, measurement] of Object.entries(run.operationMeasurements)) {
      if (!withinPositiveBudget(measurement.elapsedMs)) blockers.push(`${run.name}/${operation} elapsed time is invalid`);
      if (!withinPositiveBudget(measurement.responseBytes)) blockers.push(`${run.name}/${operation} response size is invalid`);
    }
  }
  return gate("scale-matrix", "12.1", "Full Scale Matrix", blockers, scaleMatrix ? `${scaleMatrix.length} matrix rows evaluated` : "no matrix rows attached");
}

function evaluateSoaks(soaks: AutomationStudioSoakEvidence | undefined): AutomationStudioScaleCertificationGate {
  const blockers: string[] = [];
  if (!soaks) blockers.push("24-hour runtime, recording, and subscription soak evidence has not been attached");
  if (soaks) {
    if (soaks.runtimeAppendHours < 24) blockers.push("runtime append soak is shorter than 24 hours");
    if (soaks.recordingAppendHours < 24) blockers.push("recording append soak is shorter than 24 hours");
    if (soaks.subscriptionHours < 24) blockers.push("subscription soak is shorter than 24 hours");
    if (soaks.runtimeEventsAppended <= 0) blockers.push("runtime append soak wrote no events");
    if (soaks.recordingEventsAppended <= 0) blockers.push("recording append soak wrote no events");
    if (soaks.maxAppendP95Ms > 50) blockers.push("append p95 exceeded 50 ms budget");
    if (soaks.droppedEvents !== 0) blockers.push("soak dropped events");
  }
  return gate("stream-subscription-soak", "12.2", "24-Hour Stream And Subscription Soaks", blockers, soaks ? `${soaks.runtimeEventsAppended + soaks.recordingEventsAppended} events appended` : "no soak evidence attached");
}

function evaluateCrashInjection(crashInjection: AutomationStudioCrashInjectionEvidence[] | undefined): AutomationStudioScaleCertificationGate {
  const blockers: string[] = [];
  const required = new Set<AutomationStudioCrashInjectionEvidence["scenario"]>(["graph-write", "stream-write", "object-write", "migration"]);
  if (!crashInjection?.length) blockers.push("crash injection evidence has not been attached");
  for (const scenario of crashInjection ?? []) {
    required.delete(scenario.scenario);
    if (scenario.attempts <= 0) blockers.push(`${scenario.scenario} crash scenario has no attempts`);
    if (scenario.recoveredAttempts !== scenario.attempts) blockers.push(`${scenario.scenario} did not recover every attempt`);
    if (!scenario.integrityCheckPassed) blockers.push(`${scenario.scenario} failed integrity check`);
    if (scenario.orphanedMutableRows !== 0) blockers.push(`${scenario.scenario} left orphaned mutable rows`);
    if (scenario.orphanedStagedFiles !== 0) blockers.push(`${scenario.scenario} left orphaned staged files`);
  }
  for (const missing of required) blockers.push(`${missing} crash scenario is missing`);
  return gate("crash-injection", "12.3", "Crash Injection", blockers, crashInjection ? `${crashInjection.length} crash scenarios evaluated` : "no crash evidence attached");
}

function evaluateHeapRetention(heapRetention: AutomationStudioHeapSwitchEvidence | undefined): AutomationStudioScaleCertificationGate {
  const blockers: string[] = [];
  if (!heapRetention) blockers.push("1,000-switch heap retention evidence has not been attached");
  if (heapRetention) {
    if (heapRetention.switches < 1_000) blockers.push("switch retention scenario completed fewer than 1,000 switches");
    if (heapRetention.maxRetainedHeapMiB > 32) blockers.push("retained heap exceeded 32 MiB budget");
    if (heapRetention.maxSingleTaskMs > 1_000) blockers.push("single task exceeded 1,000 ms budget");
  }
  return gate("heap-retention", "12.4", "Heap Retention Across 1,000 Switches", blockers, heapRetention ? `${heapRetention.switches} switches evaluated` : "no heap evidence attached");
}

function evaluateCriticalQueries(criticalQueries: AutomationStudioCriticalQueryEvidence[] | undefined): AutomationStudioScaleCertificationGate {
  const blockers: string[] = [];
  if (!criticalQueries?.length) blockers.push("critical query and payload evidence has not been attached");
  for (const query of criticalQueries ?? []) {
    if (query.fullScan) blockers.push(`${query.name} performs a full scan`);
    if (!query.plan.includes(query.expectedIndex)) blockers.push(`${query.name} does not mention expected index ${query.expectedIndex}`);
    if (query.elapsedMs > query.elapsedBudgetMs) blockers.push(`${query.name} exceeds elapsed budget`);
    if (query.payloadBytes > query.payloadBudgetBytes) blockers.push(`${query.name} exceeds payload budget`);
  }
  return gate("query-payload-budgets", "12.5", "Critical Query Plans And Payload Budgets", blockers, criticalQueries ? `${criticalQueries.length} query/payload checks evaluated` : "no query evidence attached");
}

function evaluateBackupReplay(backupReplay: AutomationStudioBackupReplayEvidence | undefined): AutomationStudioScaleCertificationGate {
  const blockers: string[] = [];
  if (!backupReplay) blockers.push("backup restore and compiled-plan replay evidence has not been attached");
  if (backupReplay) {
    if (backupReplay.restoredProjectDigest !== backupReplay.sourceProjectDigest) blockers.push("restored project digest does not match source digest");
    if (backupReplay.replayedPlanDigest !== backupReplay.compiledPlanDigest) blockers.push("replayed compiled plan digest does not match original plan digest");
    if (backupReplay.replayTraceDigest !== backupReplay.expectedTraceDigest) blockers.push("compiled-plan replay trace digest does not match expected trace digest");
  }
  return gate("backup-restore-replay", "12.6", "Backup Restore And Deterministic Replay", blockers, backupReplay ? `backup ${backupReplay.backupId} evaluated` : "no backup/replay evidence attached");
}

function evaluateDocumentation(documentation: AutomationStudioDocumentationEvidence | undefined): AutomationStudioScaleCertificationGate {
  const blockers: string[] = [];
  if (!documentation) blockers.push("authored/generated documentation evidence has not been attached");
  if (documentation) {
    for (const path of Object.values(AUTOMATION_STUDIO_PHASE_12_REQUIRED_DOC_PATHS)) {
      if (!documentation.authoredDocs.includes(path) && path !== AUTOMATION_STUDIO_PHASE_12_REQUIRED_DOC_PATHS.generatedReference) blockers.push(`authored documentation path is missing: ${path}`);
    }
    if (!documentation.generatedDocsChecked) blockers.push(`generated documentation was not checked with ${documentation.generatedDocsCommand}`);
  }
  return gate("documentation", "12.7", "Authored And Generated Docs", blockers, documentation ? `${documentation.authoredDocs.length} authored docs recorded` : "no docs evidence attached");
}

function evaluateFeatureFlags(featureFlags: AutomationStudioFeatureFlagEvidence[] | undefined): AutomationStudioScaleCertificationGate {
  const blockers: string[] = [];
  if (!featureFlags?.length) blockers.push("feature-flag removal evidence has not been attached");
  for (const flag of featureFlags ?? []) {
    if (!flag.removed) blockers.push(`${flag.flag} remains enabled under owner ${flag.owner}`);
  }
  return gate("feature-flag-removal", "12.8", "Feature Flag Removal Gates", blockers, featureFlags ? `${featureFlags.length} feature flags evaluated` : "no feature-flag evidence attached");
}

function gate(gateId: AutomationStudioScaleCertificationGateId, phaseStep: AutomationStudioScaleCertificationGate["phaseStep"], title: string, blockers: string[], summary: string): AutomationStudioScaleCertificationGate {
  return { gateId, phaseStep, title, status: blockers.length ? "blocked" : "passed", summary, blockers };
}

function summarizeGateStatuses(statuses: AutomationStudioScaleCertificationStatus[]): AutomationStudioScaleCertificationStatus {
  if (statuses.every((status) => status === "passed")) return "passed";
  if (statuses.some((status) => status === "failed")) return "failed";
  if (statuses.some((status) => status === "blocked")) return "blocked";
  return "not-run";
}

function withinPositiveBudget(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function digestJson(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function createPassingAutomationStudioScaleCertificationFixture(): AutomationStudioScaleCertificationReport {
  const compactProfile = scaleProfile({ projects: 1, flows: 1, subflows: 1, nodes: 10, edges: 20, nodesPerGraph: 10, edgesPerGraph: 20, instructions: 1, runs: 1, eventsPerRun: 10, recordings: 1, eventsPerRecording: 10, assets: 1 });
  return createAutomationStudioScaleCertificationReport({
    generatedAt: "2026-08-27T00:00:00.000Z",
    hardware: { machine: "fixture", os: "test", cpu: "test", memoryGiB: 64, nodeVersion: "v22.0.0", sqliteVersion: "3.fixture" },
    config: { projectDatabaseMode: "sqlite-wal", browser: "chromium", webBuildMode: "production", featureFlags: { "automationStudio.v2Storage": false } },
    scaleMatrix: ["smoke", "baseline", "target"].map((name) => ({ name, profile: compactProfile, operationMeasurements: { "workspace-open": { elapsedMs: 10, responseBytes: 1000 }, "event-page": { elapsedMs: 10, responseBytes: 1000 } } })),
    soaks: { runtimeAppendHours: 24, recordingAppendHours: 24, subscriptionHours: 24, runtimeEventsAppended: 1, recordingEventsAppended: 1, maxAppendP95Ms: 10, droppedEvents: 0, reconnects: 1 },
    crashInjection: ["graph-write", "stream-write", "object-write", "migration"].map((scenario) => ({ scenario: scenario as AutomationStudioCrashInjectionEvidence["scenario"], attempts: 3, recoveredAttempts: 3, integrityCheckPassed: true, orphanedMutableRows: 0, orphanedStagedFiles: 0 })),
    heapRetention: { switches: 1_000, maxRetainedHeapMiB: 12, maxSingleTaskMs: 100, longTaskCount: 0 },
    criticalQueries: [{ name: "hierarchy child page", expectedIndex: "hierarchy_entries_children_idx", plan: "SEARCH hierarchy_entries USING INDEX hierarchy_entries_children_idx", fullScan: false, elapsedMs: 10, elapsedBudgetMs: 100, payloadBytes: 10_000, payloadBudgetBytes: 100_000 }],
    backupReplay: { backupId: "backup.fixture", restoredProjectDigest: "digest.project", sourceProjectDigest: "digest.project", compiledPlanDigest: "digest.plan", replayedPlanDigest: "digest.plan", replayTraceDigest: "digest.trace", expectedTraceDigest: "digest.trace" },
    documentation: { authoredDocs: [AUTOMATION_STUDIO_PHASE_12_REQUIRED_DOC_PATHS.architecture, AUTOMATION_STUDIO_PHASE_12_REQUIRED_DOC_PATHS.operations, AUTOMATION_STUDIO_PHASE_12_REQUIRED_DOC_PATHS.importingRepo], generatedDocsChecked: true, generatedDocsCommand: "pnpm docs:check", operationsRunbookPath: AUTOMATION_STUDIO_PHASE_12_REQUIRED_DOC_PATHS.operations, importingRepoDocPath: AUTOMATION_STUDIO_PHASE_12_REQUIRED_DOC_PATHS.importingRepo, architectureDocPath: AUTOMATION_STUDIO_PHASE_12_REQUIRED_DOC_PATHS.architecture },
    featureFlags: [{ flag: "automationStudio.v2Storage", owner: "Automation Studio", removed: true, removalGate: "documentation" }]
  });
}
