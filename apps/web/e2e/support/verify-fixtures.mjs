import { readFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FluxIQ } from "fluxiq";
import {
  AutomationStudioProjectDatabasePool,
  AutomationStudioProjectFlowResourceRepository,
} from "fluxiq/automation-studio";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixtureRoot = path.resolve(process.env.FLUXIQ_E2E_FIXTURE_ROOT ?? path.join(webRoot, ".e2e-host"));
const verifierTarget = process.env.FLUXIQ_E2E_VERIFY_TARGET;
const verifierTargets = ["base", "empty", "ordinary", "scale", "global"];
if (!verifierTarget) {
  for (const target of verifierTargets) {
    const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
      cwd: process.cwd(),
      env: { ...process.env, FLUXIQ_E2E_VERIFY_TARGET: target },
      stdio: "inherit",
    });
    if (child.status !== 0) process.exit(child.status ?? 1);
  }
  process.exit(0);
}
if (!verifierTargets.includes(verifierTarget)) throw new Error(`Unknown fixture verifier target: ${verifierTarget}`);
const manifest = JSON.parse(await readFile(path.join(fixtureRoot, "fixture-manifest.json"), "utf8"));
const fluxiq = FluxIQ.create({ rootDir: fixtureRoot, loadEnv: false });
const studio = fluxiq.programs.automationStudio;
const projectDatabasePool = new AutomationStudioProjectDatabasePool({
  rootDir: path.join(fixtureRoot, ".fluxiq", "artifacts", "automation-studio"),
});
assertManifestRecordingOwnership(manifest);
const verifiedProjects = {};
if (verifierTarget === "base") {
  for (const name of ["small", "scale1k", "scale10k"]) {
    verifiedProjects[name] = await verifyStudioProjectFixture(name, manifest.projects[name]);
  }
}

const phase8Projects = {};
for (const profile of ["empty", "ordinary", "scale"].filter((profile) => profile === verifierTarget)) {
  const project = profile === "empty"
    ? manifest.projects.phase8Empty
    : profile === "ordinary"
      ? manifest.projects.phase8Ordinary
      : manifest.projects.phase8Scale;
  if (manifest.phase8.materialized[profile]) {
    if (!project) throw new Error(`Phase 8 ${profile} is marked materialized but has no manifest project.`);
    phase8Projects[profile] = await verifyPhase8Project(profile, project, manifest.phase8.contract.profiles[profile]);
  } else if (project) {
    throw new Error(`Phase 8 ${profile} has a project but is not marked materialized.`);
  }
}

let documentationPages = 0;
if (verifierTarget === "global") {
  for (const kind of manifest.globalStress.databaseKinds ?? []) {
    const records = await fluxiq.programs.databaseManager.listRecords(kind);
    assertEqual(records.length, 200, `${kind} records`);
  }
  const docs = await fluxiq.programs.docs.snapshot();
  documentationPages = docs.pages.length;
  if (typeof manifest.globalStress.documentationPages === "number") {
    assertEqual(docs.pages.length, manifest.globalStress.documentationPages, "documentation pages");
  }
}

const result = {
  projects: verifiedProjects,
  phase8Projects,
  databaseRecords: manifest.globalStress.databaseRecords ?? 0,
  documentationPages,
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
await projectDatabasePool.closeAll();
await studio.close();

async function verifyStudioProjectFixture(name, project) {
  if (!project?.id) throw new Error(`Fixture verification failed for ${name}: project is missing from manifest`);
  const flowId = project.flowIds?.[0];
  if (!flowId) throw new Error(`Fixture verification failed for ${name}: first flow id is missing`);

  const flow = await studio.getFlow(project.id, flowId);
  assertEqual(flow.nodes.length, project.counts.graphNodes, `${name} graph nodes`);
  const workspaceSummary = await studio.getProjectWorkspaceSummary(project.id);
  assertEqual(workspaceSummary.flows.length, project.counts.flows + project.counts.subflows, `${name} canonical workspace and Subflow graph Flows`);
  const sqlProjection = await verifySqlFlowResourceProjection({
    label: name,
    project,
    flowIds: project.flowIds,
    expectedSubflows: project.counts.subflows,
  });

  const hierarchy = await studio.getProjectHierarchy(project.id);
  assertEqual(hierarchy.customHierarchyNodes.length, project.counts.hierarchyFolders, `${name} hierarchy folders`);

  if (!project.timelineRecordingId) throw new Error(`Fixture verification failed for ${name}: timeline recording ownership is missing`);
  const recording = await studio.getRecordingSession(project.timelineRecordingId, project.id);
  assertEqual(recording.metadata?.projectId, project.id, `${name} recording owner`);
  assertEqual(recording.timeline.length, project.counts.timelineEntries, `${name} timeline entries`);

  const runPage = await studio.listFlowRunSummaries({ projectId: project.id, flowId, limit: 1, offset: 0 });
  assertEqual(runPage.total, project.counts.runs / project.counts.flows, `${name} first flow run summaries`);

  return {
    projectId: project.id,
    certificationSize: project.counts.certificationSize,
    graphNodes: flow.nodes.length,
    hierarchyFolders: hierarchy.customHierarchyNodes.length,
    flowRuns: runPage.total,
    timelineEntries: recording.timeline.length,
    sqlProjection,
  };
}

async function verifyPhase8Project(profile, project, expected) {
  reportStage(profile, "projects");
  const projects = await studio.listProjects();
  assertEqual(projects.projects.filter((item) => item.id === project.id).length, expected.projects, `${profile} persisted projects`);

  reportStage(profile, "flows");
  const flows = (await studio.listProjectArtifacts(project.id)).flows;
  assertEqual(flows.length, expected.flows, `${profile} persisted Flows`);
  const flowIds = flows.map((flow) => flow.flowId);
  const workspaceSummary = await studio.getProjectWorkspaceSummary(project.id);
  assertEqual(workspaceSummary.flows.length, expected.flows + expected.subflows, `${profile} canonical workspace and Subflow graph Flows`);

  reportStage(profile, "subflows");
  const subflows = await verifyOffsetTotal(
    (offset) => studio.listFlowSubflowSummaries({ projectId: project.id, limit: 100, offset }),
    (page) => page.subflows,
    (page) => page.total,
    expected.subflows,
    `${profile} subflows`,
  );

  reportStage(profile, "hierarchy");
  const hierarchy = await studio.getProjectHierarchy(project.id);
  const hierarchyObjects = hierarchy.customHierarchyNodes.length + flows.length + subflows;
  assertEqual(hierarchyObjects, expected.hierarchyObjects, `${profile} persisted hierarchy objects`);

  reportStage(profile, "graphs");
  const graphNodeCounts = await mapInBatches(flowIds, 16, async (flowId) => {
    const flow = await studio.getFlow(project.id, flowId);
    return Array.isArray(flow?.nodes) ? flow.nodes.length : 0;
  });
  const activeGraphNodes = graphNodeCounts.reduce((total, count) => total + count, 0);
  assertEqual(activeGraphNodes, expected.activeGraphNodes, `${profile} persisted active graph nodes`);

  reportStage(profile, "routes");
  const routeCounts = await mapInBatches(flowIds, 16, async (flowId) => (await studio.getFlowRouter(project.id, flowId))?.rules.length ?? 0);
  const routes = routeCounts.reduce((total, count) => total + count, 0);
  assertEqual(routes, expected.routes, `${profile} persisted routes`);
  const sqlProjection = await verifySqlFlowResourceProjection({
    label: profile,
    project,
    flowIds,
    expectedSubflows: expected.subflows,
    expectedRoutes: expected.routes,
  });

  reportStage(profile, "runs");
  const runs = await collectOffsetItems(
    (offset) => studio.listFlowRunSummaries({ projectId: project.id, limit: 100, offset }),
    (page) => page.runs,
    (page) => page.total,
    `${profile} runs`,
  );
  assertEqual(runs.length, expected.runs, `${profile} persisted runs`);
  const expectedRunsPerFlow = expected.flows > 0 ? expected.runs / expected.flows : 0;
  if (!Number.isInteger(expectedRunsPerFlow)) {
    throw new Error(`${profile} run count must divide evenly by Flow count.`);
  }
  for (const flowId of flowIds) {
    assertEqual(
      runs.filter((run) => run.flowId === flowId).length,
      expectedRunsPerFlow,
      `${profile} Flow ${flowId} run ownership distribution`,
    );
  }
  reportStage(profile, "run-actions");
  const eventCounts = await mapInBatches(runs, 1, async (run) => {
    const page = await studio.listFlowRunActions({ projectId: project.id, runId: run.runId, limit: 1, offset: 0 });
    assertEqual(page.total, run.actionAttemptCount, `${profile} run ${run.runId} action projection`);
    return page.total;
  });
  const runEvents = eventCounts.reduce((total, count) => total + count, 0);
  assertEqual(runEvents, expected.runEvents, `${profile} persisted run events`);

  reportStage(profile, "recordings");
  const recordings = await collectOffsetItems(
    (offset) => studio.listRecordingSessionSummaryPage(project.id, { limit: 100, offset }),
    (page) => page.recordings,
    (page) => page.page.total,
    `${profile} recordings`,
  );
  assertEqual(recordings.length, expected.recordings, `${profile} persisted recordings`);
  const persistedRecordingIds = recordings.map((recording) => recording.recordingId).sort();
  const ownedRecordingIds = [...(project.recordingIds ?? [])].sort();
  assertEqual(JSON.stringify(persistedRecordingIds), JSON.stringify(ownedRecordingIds), `${profile} recording manifest ownership`);

  reportStage(profile, "adaptations");
  const adaptations = await verifyOffsetTotal(
    (offset) => studio.listFlowAdaptationSummaries({ projectId: project.id, limit: 100, offset }),
    (page) => page.adaptations,
    (page) => page.total,
    expected.adaptations,
    `${profile} adaptations`,
  );

  reportStage(profile, "corpora");
  const certificationDir = path.join(fixtureRoot, "programs", "automation-studio", "projects", project.id, "certification");
  const problems = await countNdjson(path.join(certificationDir, "problems.ndjson"));
  const docs = await countNdjson(path.join(certificationDir, "docs.ndjson"));
  assertEqual(problems, expected.problems, `${profile} persisted Problems records`);
  assertEqual(docs, expected.docs, `${profile} persisted Docs records`);
  return {
    projectId: project.id,
    projects: expected.projects,
    flows: flows.length,
    subflows,
    hierarchyObjects,
    activeGraphNodes,
    routes,
    runEvents,
    problems,
    docs,
    recordings: recordings.length,
    runs: runs.length,
    adaptations,
    sqlProjection,
  };
}

async function verifySqlFlowResourceProjection({ label, project, flowIds, expectedSubflows, expectedRoutes }) {
  const repository = await AutomationStudioProjectFlowResourceRepository.open({
    pool: projectDatabasePool,
    projectId: project.id,
  });
  try {
    const inventory = await repository.listSubflowSummariesPage({ limit: 1, offset: 0 });
    assertEqual(inventory.total, expectedSubflows, `${label} SQL Subflow projection total`);

    const subflowSamples = await readSqlSubflowSamples(repository, inventory.total);
    await mapInBatches(subflowSamples, 16, async (subflow) => {
      if (!subflow.graphFlowId) {
        throw new Error(`Fixture verification failed for ${label} SQL Subflow ${subflow.subflowId}: graphFlowId is missing`);
      }
      const [sqlGraph, resolvedGraph] = await Promise.all([
        repository.getFlow(subflow.graphFlowId),
        studio.getFlow(project.id, subflow.graphFlowId),
      ]);
      if (!sqlGraph || sqlGraph.deletedAt !== null) {
        throw new Error(`Fixture verification failed for ${label} SQL Subflow ${subflow.subflowId}: backing graph ${subflow.graphFlowId} is absent from SQL`);
      }
      assertEqual(sqlGraph.parentFlowId, subflow.parentFlowId, `${label} SQL Subflow ${subflow.subflowId} graph parent`);
      assertEqual(resolvedGraph.flowId, subflow.graphFlowId, `${label} SQL Subflow ${subflow.subflowId} resolvable graph`);
    });

    const routerProjection = await mapInBatches(flowIds, 16, async (flowId) => {
      const summary = await repository.getRouterSummaryForFlow(flowId);
      const routes = await repository.listRouterRoutesPage({ flowId, limit: 1 });
      return { projected: Boolean(summary), routes: routes.counts.total };
    });
    const expectedRouters = expectedSubflows > 0 ? flowIds.length : 0;
    const routers = routerProjection.filter((item) => item.projected).length;
    const routes = routerProjection.reduce((total, item) => total + item.routes, 0);
    assertEqual(routers, expectedRouters, `${label} SQL Router projection total`);
    if (expectedRoutes !== undefined) assertEqual(routes, expectedRoutes, `${label} SQL Router route projection total`);

    return {
      subflows: inventory.total,
      verifiedGraphs: subflowSamples.length,
      graphCoverage: inventory.total <= 500 ? "all" : "deterministic-sample",
      routers,
      routes,
    };
  } finally {
    await repository.close();
  }
}

async function readSqlSubflowSamples(repository, total) {
  if (total === 0) return [];
  if (total <= 500) {
    return (await repository.listSubflowSummariesPage({ limit: total, offset: 0 })).items;
  }
  const sampleSize = 256;
  const offsets = Array.from({ length: sampleSize }, (_, index) =>
    Math.round(index * (total - 1) / (sampleSize - 1))
  );
  return await mapInBatches(offsets, 16, async (offset) => {
    const page = await repository.listSubflowSummariesPage({ limit: 1, offset });
    const subflow = page.items[0];
    if (!subflow) throw new Error(`Fixture verification failed: SQL Subflow sample at offset ${offset} is missing`);
    return subflow;
  });
}

function reportStage(profile, stage) {
  process.stderr.write(`[fixture:verify] ${profile} ${stage}\n`);
}

async function collectOffsetItems(loadPage, readItems, readTotal, label) {
  const items = [];
  let expectedTotal = null;
  while (expectedTotal === null || items.length < expectedTotal) {
    const page = await loadPage(items.length);
    const pageItems = readItems(page);
    const total = readTotal(page);
    if (expectedTotal === null) expectedTotal = total;
    else assertEqual(total, expectedTotal, `${label} stable page total`);
    if (pageItems.length === 0 && items.length < expectedTotal) throw new Error(`Fixture verification failed for ${label}: page at offset ${items.length} did not advance`);
    items.push(...pageItems);
  }
  assertEqual(items.length, expectedTotal ?? 0, `${label} paged enumeration`);
  return items;
}

async function verifyOffsetTotal(loadPage, readItems, readTotal, expectedTotal, label) {
  const first = await loadPage(0);
  const total = readTotal(first);
  assertEqual(total, expectedTotal, `${label} total`);
  const firstItems = readItems(first);
  if (expectedTotal === 0) {
    assertEqual(firstItems.length, 0, `${label} empty page`);
    return total;
  }
  if (firstItems.length === 0) throw new Error(`Fixture verification failed for ${label}: first page did not advance`);
  const lastOffset = expectedTotal - 1;
  const last = await loadPage(lastOffset);
  assertEqual(readTotal(last), expectedTotal, `${label} stable page total`);
  assertEqual(readItems(last).length, 1, `${label} final page`);
  return total;
}

async function mapInBatches(items, batchSize, map) {
  const results = [];
  for (let start = 0; start < items.length; start += batchSize) {
    results.push(...await Promise.all(items.slice(start, start + batchSize).map(map)));
  }
  return results;
}

async function countNdjson(target) {
  let count = 0;
  const lines = createInterface({ input: createReadStream(target, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const line of lines) if (line.trim()) count += 1;
  return count;
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`Fixture verification failed for ${label}: expected ${expected}, received ${actual}`);
  }
}

function assertManifestRecordingOwnership(fixtureManifest) {
  const owners = new Map();
  for (const project of Object.values(fixtureManifest.projects ?? {})) {
    if (!project?.id) continue;
    const recordingIds = project.recordingIds ?? [];
    if (project.timelineRecordingId && !recordingIds.includes(project.timelineRecordingId)) {
      throw new Error(`Fixture verification failed: ${project.id} timeline recording is absent from its recordingIds manifest.`);
    }
    for (const recordingId of recordingIds) {
      if (!recordingId.startsWith(`recording.${project.id}.`)) {
        throw new Error(`Fixture verification failed: recording ${recordingId} is not namespaced to owner ${project.id}.`);
      }
      const existingOwner = owners.get(recordingId);
      if (existingOwner && existingOwner !== project.id) {
        throw new Error(`Fixture verification failed: recording ${recordingId} is claimed by ${existingOwner} and ${project.id}.`);
      }
      owners.set(recordingId, project.id);
    }
  }
}
