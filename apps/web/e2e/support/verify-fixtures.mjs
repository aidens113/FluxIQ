import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FluxIQ } from "fluxiq";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixtureRoot = path.resolve(process.env.FLUXIQ_E2E_FIXTURE_ROOT ?? path.join(webRoot, ".e2e-host"));
const manifest = JSON.parse(await readFile(path.join(fixtureRoot, "fixture-manifest.json"), "utf8"));
const fluxiq = FluxIQ.create({ rootDir: fixtureRoot, loadEnv: false });
const studio = fluxiq.programs.automationStudio;
const scale = manifest.projects.scale;
const flowId = scale.flowIds[0];

const flow = await studio.getProjectArtifact(scale.id, "flow", flowId);
assertEqual(flow.nodes.length, scale.counts.graphNodes, "graph nodes");

const hierarchy = await studio.getProjectHierarchy(scale.id);
assertEqual(hierarchy.customHierarchyNodes.length, scale.counts.hierarchyFolders, "hierarchy folders");

const recording = await studio.getRecordingSession("recording.ui-stress-timeline", scale.id);
assertEqual(recording.timeline.length, scale.counts.timelineEntries, "timeline entries");

const runPage = await studio.listFlowRunSummaries({
  projectId: scale.id,
  flowId,
  limit: 1,
  offset: 0,
});
assertEqual(runPage.total, 24, "first flow run summaries");

for (const kind of manifest.globalStress.databaseKinds) {
  const records = await fluxiq.programs.databaseManager.listRecords(kind);
  assertEqual(records.length, 200, `${kind} records`);
}

const docs = await fluxiq.programs.docs.snapshot();
assertEqual(docs.pages.length, manifest.globalStress.documentationPages, "documentation pages");

const result = {
  projectId: scale.id,
  graphNodes: flow.nodes.length,
  hierarchyFolders: hierarchy.customHierarchyNodes.length,
  flowRuns: runPage.total,
  timelineEntries: recording.timeline.length,
  databaseRecords: manifest.globalStress.databaseRecords,
  documentationPages: docs.pages.length,
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`Fixture verification failed for ${label}: expected ${expected}, received ${actual}`);
  }
}
