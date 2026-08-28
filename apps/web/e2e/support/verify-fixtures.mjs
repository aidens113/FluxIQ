import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FluxIQ } from "fluxiq";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixtureRoot = path.resolve(process.env.FLUXIQ_E2E_FIXTURE_ROOT ?? path.join(webRoot, ".e2e-host"));
const manifest = JSON.parse(await readFile(path.join(fixtureRoot, "fixture-manifest.json"), "utf8"));
const fluxiq = FluxIQ.create({ rootDir: fixtureRoot, loadEnv: false });
const studio = fluxiq.programs.automationStudio;
const verifiedProjects = {};
for (const name of ["small", "scale1k", "scale10k"]) {
  verifiedProjects[name] = await verifyStudioProjectFixture(name, manifest.projects[name]);
}

for (const kind of manifest.globalStress.databaseKinds) {
  const records = await fluxiq.programs.databaseManager.listRecords(kind);
  assertEqual(records.length, 200, `${kind} records`);
}

const docs = await fluxiq.programs.docs.snapshot();
assertEqual(docs.pages.length, manifest.globalStress.documentationPages, "documentation pages");

const result = {
  projects: verifiedProjects,
  databaseRecords: manifest.globalStress.databaseRecords,
  documentationPages: docs.pages.length,
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

async function verifyStudioProjectFixture(name, project) {
  if (!project?.id) throw new Error(`Fixture verification failed for ${name}: project is missing from manifest`);
  const flowId = project.flowIds?.[0];
  if (!flowId) throw new Error(`Fixture verification failed for ${name}: first flow id is missing`);

  const flow = await studio.getProjectArtifact(project.id, "flow", flowId);
  assertEqual(flow.nodes.length, project.counts.graphNodes, `${name} graph nodes`);

  const hierarchy = await studio.getProjectHierarchy(project.id);
  assertEqual(hierarchy.customHierarchyNodes.length, project.counts.hierarchyFolders, `${name} hierarchy folders`);

  const recording = await studio.getRecordingSession("recording.ui-stress-timeline", project.id);
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
  };
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`Fixture verification failed for ${label}: expected ${expected}, received ${actual}`);
  }
}
