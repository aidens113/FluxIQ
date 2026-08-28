import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FluxIQ } from "fluxiq";
import { createAutomationStudioLargeProjectFixture } from "fluxiq/automation-studio";

const FIXTURE_MARKER = "fluxiq-e2e-fixture-v1";
const FIXED_NOW_MS = Date.UTC(2026, 0, 15, 12, 0, 0);
const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixtureRoot = path.resolve(process.env.FLUXIQ_E2E_FIXTURE_ROOT ?? path.join(webRoot, ".e2e-host"));
const fixtureProfiles = Object.freeze({
  small: Object.freeze({
    flowCount: 2,
    subflowsPerFlow: 4,
    runsPerFlow: 18,
    adaptationsPerFlow: 8,
    instructionsPerFlow: 6,
    recordingCount: 1,
    graphNodeCount: 120,
    hierarchyFolderCount: 80,
    timelineEntryCount: 240,
  }),
  scale1k: Object.freeze({
    flowCount: 8,
    subflowsPerFlow: 8,
    runsPerFlow: 40,
    adaptationsPerFlow: 12,
    instructionsPerFlow: 12,
    recordingCount: 2,
    graphNodeCount: 1_000,
    hierarchyFolderCount: 1_000,
    timelineEntryCount: 1_000,
  }),
  scale10k: Object.freeze({
    flowCount: 20,
    subflowsPerFlow: 12,
    runsPerFlow: 60,
    adaptationsPerFlow: 16,
    instructionsPerFlow: 16,
    recordingCount: 4,
    graphNodeCount: 10_000,
    hierarchyFolderCount: 2_000,
    timelineEntryCount: 10_000,
  }),
});
const markerPath = path.join(fixtureRoot, ".fluxiq-e2e-fixture-root");

await resetOwnedFixtureRoot();

const fluxiq = FluxIQ.create({ rootDir: fixtureRoot, loadEnv: false });
await fluxiq.setup();
const studio = fluxiq.programs.automationStudio;
const category = await studio.createProjectCategory({ name: "UI Baselines" });

const emptyProject = await studio.createProject({
  name: "UI Fixture - Empty",
  description: "Deterministic empty states for Automation Studio.",
  categoryId: category.id,
});

const smallProject = await seedProject({
  name: "UI Fixture - Small",
  description: "Small deterministic flows, instructions, routes, runs, and adaptations.",
  categoryId: category.id,
  fixture: fixtureProfiles.small,
});

const scale1kProject = await seedProject({
  name: "UI Fixture - Scale 1k",
  description: "One-thousand-entity hierarchy and graph data for UI performance checks.",
  categoryId: category.id,
  fixture: fixtureProfiles.scale1k,
});

const scale10kProject = await seedProject({
  name: "UI Fixture - Scale 10k",
  description: "Ten-thousand-node graph and event-log data for local Studio certification.",
  categoryId: category.id,
  fixture: fixtureProfiles.scale10k,
});

const globalStress = await seedGlobalStressFixtures();

const manifest = {
  schemaVersion: 1,
  fixedNowMs: FIXED_NOW_MS,
  root: fixtureRoot,
  credentials: { username: "admin", password: "admin" },
  fixtureProfiles,
  projects: {
    empty: summarizeProject(emptyProject),
    small: smallProject,
    scale1k: scale1kProject,
    scale10k: scale10kProject,
    representative: smallProject,
    scale: scale1kProject,
  },
  globalStress,
};

await writeFile(path.join(fixtureRoot, "fixture-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);

async function seedProject({ name, description, categoryId, fixture: fixtureOptions }) {
  const project = await studio.createProject({ name, description, categoryId });
  const fixture = createAutomationStudioLargeProjectFixture({
    ...fixtureOptions,
    projectId: project.id,
    nowMs: FIXED_NOW_MS,
  });

  const graphNodeCount = fixtureOptions.graphNodeCount ?? 0;
  if (graphNodeCount > 0 && fixture.flows[0]) {
    fixture.flows[0] = withStressGraph(fixture.flows[0], graphNodeCount);
  }

  for (const artifact of fixture.flows) {
    await studio.saveProjectArtifact({ projectId: project.id, kind: "flow", artifact });
  }
  for (const router of fixture.routers) await studio.saveFlowRouter(router);
  for (const subflow of fixture.subflows) await studio.saveFlowSubflow(subflow);
  for (const instruction of fixture.instructions) await studio.saveFlowInstruction(project.id, instruction);
  for (const proposal of fixture.changeProposals) await studio.saveFlowChangeProposal(proposal);
  for (const detail of fixture.runDetails) await studio.saveFlowRunDetail(detail);
  for (const adaptation of fixture.adaptations) await studio.saveFlowAdaptation(adaptation);
  for (const policy of fixture.policies) await studio.saveFlowAdaptationPolicy(project.id, policy);

  const hierarchyFolderCount = fixtureOptions.hierarchyFolderCount ?? 0;
  if (hierarchyFolderCount > 0) {
    await studio.saveProjectHierarchy(project.id, {
      customHierarchyNodes: stressHierarchyNodes(hierarchyFolderCount),
      deletedHierarchyIds: [],
      workspacePrefs: {},
    });
  }

  const timelineEntryCount = fixtureOptions.timelineEntryCount ?? 0;
  if (timelineEntryCount > 0) {
    await seedStressRecording(project.id, timelineEntryCount);
  }

  return {
    ...summarizeProject(project),
    flowIds: fixture.flows.map((flow) => flow.flowId),
    counts: {
      flows: fixture.flows.length,
      subflows: fixture.subflows.length,
      instructions: fixture.instructions.length,
      runs: fixture.runDetails.length,
      adaptations: fixture.adaptations.length,
      graphNodes: graphNodeCount,
      hierarchyFolders: hierarchyFolderCount,
      timelineEntries: timelineEntryCount,
      certificationSize: Math.max(graphNodeCount, hierarchyFolderCount, timelineEntryCount),
    },
  };
}

function withStressGraph(flow, nodeCount) {
  const nodes = Array.from({ length: nodeCount }, (_, index) => ({
    id: `node.stress.${index}`,
    definitionId: "builtin.policy.action",
    label: `Stress action ${index + 1}`,
    parameterValues: { actionIndex: index, payload: `fixture-${index}` },
    position: { x: (index % 15) * 220, y: Math.floor(index / 15) * 140 },
  }));
  const edges = nodes.slice(1).map((node, index) => ({
    id: `edge.stress.${index}`,
    sourceNodeId: nodes[index].id,
    targetNodeId: node.id,
  }));
  return {
    ...flow,
    nodes,
    edges,
    metadata: { ...(flow.metadata ?? {}), stressFixture: true },
  };
}

function stressHierarchyNodes(count) {
  return Array.from({ length: count }, (_, index) => {
    const branch = Math.floor(index / 12);
    const depth = index % 12;
    return {
      id: `fixture-folder-${branch}-${depth}`,
      label: `Fixture folder ${branch + 1} / level ${depth + 1}`,
      kind: "folder",
      category: "flow",
      parentId: depth === 0 ? null : `fixture-folder-${branch}-${depth - 1}`,
    };
  });
}

async function seedStressRecording(projectId, entryCount) {
  const recordingId = "recording.ui-stress-timeline";
  await studio.createRecording({
    projectId,
    recordingId,
    taskId: "task.ui-stress-timeline",
    startedAt: FIXED_NOW_MS,
    environment: {
      id: "environment.ui-fixture",
      label: "UI Fixture Browser",
      kind: "fixture",
      domainId: null,
      capabilities: ["ui.actions", "ui.state"],
    },
    sources: [{ id: "source.ui-fixture", label: "UI Fixture", kind: "action" }],
    actionChannels: [{ id: "channel.ui", label: "UI Actions", actionTypes: ["ui.click"] }],
    initialState: { timestamp: FIXED_NOW_MS, namespaces: {} },
    metadata: { projectId, title: "UI Stress Timeline" },
  });
  const entries = Array.from({ length: entryCount }, (_, index) => ({
    id: `entry.ui-stress.${index}`,
    type: "action",
    timestamp: FIXED_NOW_MS + index * 25,
    monotonicOffsetMs: index * 25,
    sourceId: "source.ui-fixture",
    actionType: "ui.click",
    parameters: { index, button: "primary" },
    target: { type: "ui_element", id: `target-${index % 40}`, label: `Target ${index % 40}` },
    origin: "runtime",
    startedAt: FIXED_NOW_MS + index * 25,
    completedAt: FIXED_NOW_MS + index * 25 + 5,
    result: {
      status: index % 37 === 0 ? "failed" : "succeeded",
      ...(index % 37 === 0 ? { message: "Deterministic stress failure." } : {}),
    },
  }));
  await studio.appendRecordingEvents({ projectId, recordingId, entries });
  await studio.finalizeRecording({
    projectId,
    recordingId,
    endedAt: FIXED_NOW_MS + entryCount * 25,
  });
}

async function seedGlobalStressFixtures() {
  const databaseKinds = ["compute.nodes", "deployment.targets", "production.targets"];
  const recordsPerKind = 200;
  for (const kind of databaseKinds) {
    for (let start = 0; start < recordsPerKind; start += 25) {
      await Promise.all(Array.from({ length: Math.min(25, recordsPerKind - start) }, (_, offset) => {
        const index = start + offset;
        return fluxiq.programs.databaseManager.putRecord(kind, `fixture.${index}`, {
          name: `Fixture record ${index + 1}`,
          status: index % 11 === 0 ? "warning" : "ready",
          group: `group-${index % 12}`,
          sequence: index,
        });
      }));
    }
  }

  const docsRoot = path.join(fixtureRoot, "docs", "stress");
  const pageCount = 240;
  await Promise.all(Array.from({ length: pageCount }, async (_, index) => {
    const section = `section-${Math.floor(index / 20) + 1}`;
    const target = path.join(docsRoot, section, `page-${String(index + 1).padStart(3, "0")}.md`);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, `# Fixture page ${index + 1}\n\nDeterministic documentation stress content for section ${section}.\n`, "utf8");
  }));
  const docsSnapshot = await fluxiq.programs.docs.rebuild(FIXED_NOW_MS);

  return {
    databaseRecords: databaseKinds.length * recordsPerKind,
    databaseKinds,
    documentationPages: docsSnapshot.pages.length,
    authoredDocumentationPages: pageCount,
  };
}

function summarizeProject(project) {
  return { id: project.id, name: project.name };
}

async function resetOwnedFixtureRoot() {
  if (await exists(fixtureRoot)) {
    const marker = await readFile(markerPath, "utf8").catch(() => "");
    if (marker.trim() !== FIXTURE_MARKER) {
      throw new Error(`Refusing to reset unmarked fixture directory: ${fixtureRoot}`);
    }
    await rm(fixtureRoot, { recursive: true, force: true });
  }
  await mkdir(fixtureRoot, { recursive: true });
  await writeFile(markerPath, `${FIXTURE_MARKER}\n`, "utf8");
}

async function exists(target) {
  return stat(target).then(() => true, () => false);
}
