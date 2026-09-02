import { mkdir, open, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FluxIQ } from "fluxiq";
import { createAutomationStudioLargeProjectFixture } from "fluxiq/automation-studio";

const FIXTURE_MARKER = "fluxiq-e2e-fixture-v1";
const FIXED_NOW_MS = Date.UTC(2026, 0, 15, 12, 0, 0);
const FIXTURE_USERNAME = "admin";
const FIXTURE_PASSWORD = "FluxIQ-E2E-Admin!";
const FIXTURE_SECURITY_PIN = "123456";
const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixtureRoot = path.resolve(process.env.FLUXIQ_E2E_FIXTURE_ROOT ?? path.join(webRoot, ".e2e-host"));
const phase8Contract = JSON.parse(await readFile(new URL("./phase8-fixture-contract.json", import.meta.url), "utf8"));
const phase8Selection = (process.env.FLUXIQ_E2E_PHASE8_PROFILE ?? "none").trim().toLowerCase();
if (!["none", "ordinary", "scale", "all"].includes(phase8Selection)) {
  throw new Error("FLUXIQ_E2E_PHASE8_PROFILE must be none, ordinary, scale, or all.");
}
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
const fastStudioOnly = process.env.FLUXIQ_E2E_FAST_STUDIO === "true";

await resetOwnedFixtureRoot();

const fluxiq = FluxIQ.create({ rootDir: fixtureRoot, loadEnv: false });
await fluxiq.setup();
await fluxiq.programs.identityAccess.setPassword(FIXTURE_USERNAME, FIXTURE_PASSWORD);
await fluxiq.programs.identityAccess.setPin(FIXTURE_USERNAME, FIXTURE_SECURITY_PIN);
const studio = fluxiq.programs.automationStudio;
const category = await studio.createProjectCategory({ name: "UI Baselines" });

const emptyProject = await studio.createProject({
  name: "UI Fixture - Empty",
  description: "Deterministic empty states for Automation Studio.",
  categoryId: category.id,
});

const phase8EmptyProject = await seedPhase8Project("empty", phase8Contract.profiles.empty, category.id);

const smallProject = await seedProject({
  name: "UI Fixture - Small",
  description: "Small deterministic flows, instructions, routes, runs, and adaptations.",
  categoryId: category.id,
  fixture: fixtureProfiles.small,
});

const scale1kProject = fastStudioOnly ? smallProject : await seedProject({
  name: "UI Fixture - Scale 1k",
  description: "One-thousand-entity hierarchy and graph data for UI performance checks.",
  categoryId: category.id,
  fixture: fixtureProfiles.scale1k,
});

const scale10kProject = fastStudioOnly ? smallProject : await seedProject({
  name: "UI Fixture - Scale 10k",
  description: "Ten-thousand-node graph and event-log data for local Studio certification.",
  categoryId: category.id,
  fixture: fixtureProfiles.scale10k,
});

const phase8OrdinaryProject = includesPhase8Profile("ordinary")
  ? await seedPhase8Project("ordinary", phase8Contract.profiles.ordinary, category.id)
  : null;
const phase8ScaleProject = includesPhase8Profile("scale")
  ? await seedPhase8Project("scale", phase8Contract.profiles.scale, category.id)
  : null;

const globalStress = fastStudioOnly ? {} : await seedGlobalStressFixtures();

const manifest = {
  schemaVersion: 1,
  fixedNowMs: FIXED_NOW_MS,
  root: fixtureRoot,
  credentials: { username: FIXTURE_USERNAME, password: FIXTURE_PASSWORD, securityPin: FIXTURE_SECURITY_PIN },
  fixtureProfiles,
  projects: {
    empty: summarizeProject(emptyProject),
    small: smallProject,
    scale1k: scale1kProject,
    scale10k: scale10kProject,
    representative: smallProject,
    scale: scale1kProject,
    phase8Empty: phase8EmptyProject,
    phase8Ordinary: phase8OrdinaryProject,
    phase8Scale: phase8ScaleProject,
  },
  phase8: {
    contract: phase8Contract,
    selection: phase8Selection,
    materialized: {
      empty: true,
      ordinary: Boolean(phase8OrdinaryProject),
      scale: Boolean(phase8ScaleProject),
    },
  },
  globalStress,
};

await writeFile(path.join(fixtureRoot, "fixture-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);

async function seedProject({ name, description, categoryId, fixture: fixtureOptions }) {
  const project = await studio.createProject({ name, description, categoryId });
  const fixture = namespaceLargeFixtureIdentifiers(createAutomationStudioLargeProjectFixture({
    ...fixtureOptions,
    projectId: project.id,
    nowMs: FIXED_NOW_MS,
  }), project.id);

  const graphNodeCount = fixtureOptions.graphNodeCount ?? 0;
  if (graphNodeCount > 0 && fixture.flows[0]) {
    fixture.flows[0] = withStressGraph(fixture.flows[0], graphNodeCount);
  }

  for (const artifact of fixture.flows) {
    await studio.saveFlow({ projectId: project.id, flow: ownedFixtureFlow(project.id, artifact) });
  }
  for (const subflow of fixture.subflows) await studio.saveFlowSubflow(subflow);
  for (const router of fixture.routers) await studio.saveFlowRouter(router);
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
  const timelineRecordingId = timelineEntryCount > 0
    ? await seedStressRecording(project.id, timelineEntryCount)
    : null;

  return {
    ...summarizeProject(project),
    flowIds: fixture.flows.map((flow) => flow.flowId),
    recordingIds: timelineRecordingId ? [timelineRecordingId] : [],
    timelineRecordingId,
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

async function seedPhase8Project(profileName, counts, categoryId) {
  const flowCount = counts.flows;
  const subflowsPerFlow = flowCount > 0 ? counts.subflows / flowCount : 0;
  const runsPerFlow = flowCount > 0 ? counts.runs / flowCount : 0;
  const adaptationsPerFlow = flowCount > 0 ? counts.adaptations / flowCount : 0;
  for (const [label, value] of Object.entries({ subflowsPerFlow, runsPerFlow, adaptationsPerFlow })) {
    if (!Number.isInteger(value)) throw new Error(`Phase 8 ${profileName} ${label} must divide evenly by Flow count.`);
  }
  const project = await studio.createProject({
    name: `Phase 8 - ${profileName[0].toUpperCase()}${profileName.slice(1)}`,
    description: `Storage-seeded ${profileName} release fixture.`,
    categoryId,
  });
  const fixture = namespaceLargeFixtureIdentifiers(createAutomationStudioLargeProjectFixture({
    projectId: project.id,
    nowMs: FIXED_NOW_MS,
    flowCount,
    subflowsPerFlow: Math.max(1, subflowsPerFlow),
    runsPerFlow,
    adaptationsPerFlow,
    instructionsPerFlow: profileName === "empty" ? 0 : 2,
    recordingCount: counts.recordings,
  }), project.id);
  if (counts.subflows === 0) {
    fixture.subflows.length = 0;
    fixture.routers.length = 0;
    fixture.instructions.length = 0;
    fixture.changeProposals.length = 0;
    fixture.policies.length = 0;
    fixture.adaptations.length = 0;
    fixture.runDetails.length = 0;
    fixture.flows[0] = withStressGraph({ ...fixture.flows[0], expansion: {} }, counts.activeGraphNodes);
  } else {
    fixture.flows[0] = withStressGraph(fixture.flows[0], counts.activeGraphNodes);
    expandRoutes(fixture.routers, fixture.subflows, counts.routes);
    expandRunEvents(fixture.runDetails, counts.runEvents);
  }

  const recordingIds = fixture.recordings.map((_, index) =>
    projectOwnedRecordingId(project.id, `phase8-${profileName}-${index}`)
  );
  const recordingLabels = fixture.recordings.map((recording, index) =>
    String(recording.metadata?.title ?? recording.metadata?.name ?? `Recording ${index + 1}`)
  );

  for (const artifact of fixture.flows) await studio.saveFlow({ projectId: project.id, flow: ownedFixtureFlow(project.id, artifact) });
  for (const subflow of fixture.subflows) await studio.saveFlowSubflow(subflow);
  for (const router of fixture.routers) await studio.saveFlowRouter(router);
  for (const instruction of fixture.instructions) await studio.saveFlowInstruction(project.id, instruction);
  for (const detail of fixture.runDetails) await studio.saveFlowRunDetail(detail);
  for (const adaptation of fixture.adaptations) await studio.saveFlowAdaptation(adaptation);
  for (const policy of fixture.policies) await studio.saveFlowAdaptationPolicy(project.id, policy);

  for (let index = 0; index < fixture.recordings.length; index += 1) {
    const persistedRecordingId = await persistFixtureRecording(project.id, fixture.recordings[index], `phase8-${profileName}-${index}`);
    if (persistedRecordingId !== recordingIds[index]) {
      throw new Error(`Phase 8 ${profileName} recording ${index} was persisted under an unexpected identifier.`);
    }
  }
  if (recordingIds.length !== counts.recordings) {
    throw new Error(`Expected ${counts.recordings} Phase 8 ${profileName} recordings, generated ${recordingIds.length}.`);
  }

  const customHierarchyCount = Math.max(0, counts.hierarchyObjects - counts.flows - counts.subflows);
  if (customHierarchyCount > 0) {
    const recordingNodes = phase8RecordingHierarchyNodes(fixture.flows[0], recordingIds, recordingLabels, profileName);
    if (recordingNodes.length > customHierarchyCount) {
      throw new Error(`Phase 8 ${profileName} hierarchy has no room for ${recordingNodes.length} recording entries.`);
    }
    await studio.saveProjectHierarchy(project.id, {
      customHierarchyNodes: [
        ...recordingNodes,
        ...stressHierarchyNodes(customHierarchyCount - recordingNodes.length),
      ],
      deletedHierarchyIds: [],
      workspacePrefs: {},
    });
  }
  const certificationDir = path.join(fixtureRoot, "programs", "automation-studio", "projects", project.id, "certification");
  await mkdir(certificationDir, { recursive: true });
  await writeNdjson(path.join(certificationDir, "problems.ndjson"), counts.problems, (index) => ({
    id: `problem.phase8.${index}`,
    severity: index % 11 === 0 ? "error" : index % 3 === 0 ? "warning" : "info",
    status: "open",
    artifactKind: "flow",
    artifactId: fixture.flows[index % fixture.flows.length]?.flowId,
    message: `Deterministic certification problem ${index}`,
  }));
  await writeNdjson(path.join(certificationDir, "docs.ndjson"), counts.docs, (index) => ({
    id: `doc.phase8.${index}`,
    path: `phase8/${profileName}/page-${index}.md`,
    title: `Certification document ${index}`,
    body: `# Certification document ${index}\n\nDeterministic ${profileName} fixture content.`,
  }));
  const summary = {
    ...summarizeProject(project),
    flowIds: fixture.flows.map((flow) => flow.flowId),
    runIds: fixture.runDetails.map((detail) => detail.summary.runId),
    recordingIds,
    recordingLabels,
    counts,
    storage: {
      problems: path.join(certificationDir, "problems.ndjson"),
      docs: path.join(certificationDir, "docs.ndjson"),
    },
  };
  await writeFile(path.join(certificationDir, "phase8-counts.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  return summary;
}

function includesPhase8Profile(profile) {
  return phase8Selection === "all" || phase8Selection === profile;
}

function ownedFixtureFlow(projectId, flow) {
  return { ...flow, ownerKind: "project", ownerId: projectId };
}

function namespaceLargeFixtureIdentifiers(fixture, namespace) {
  const prefix = String(namespace).replace(/[^a-zA-Z0-9_-]/g, "-");
  const visit = (value) => {
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, visit(nested)]));
    }
    if (typeof value !== "string") return value;
    return value.replace(
      /^(flow|router|subflow|route|instruction|proposal|run|decision|entry|intervention|adaptation|adaptation-policy|expectation|recording)\.(large|validation)\./,
      `$1.$2.${prefix}.`,
    );
  };
  return visit(fixture);
}

function expandRoutes(routers, subflows, routeCount) {
  let emitted = 0;
  const subflowsByFlow = new Map();
  for (const subflow of subflows) {
    const values = subflowsByFlow.get(subflow.flowId) ?? [];
    values.push(subflow);
    subflowsByFlow.set(subflow.flowId, values);
  }
  for (let routerIndex = 0; routerIndex < routers.length; routerIndex += 1) {
    const router = routers[routerIndex];
    const remainingRouters = routers.length - routerIndex;
    const localCount = Math.floor((routeCount - emitted) / remainingRouters);
    const targets = subflowsByFlow.get(router.flowId) ?? [];
    router.rules = Array.from({ length: localCount }, (_, index) => ({
      schemaVersion: "0.1",
      ruleId: `route.phase8.${routerIndex}.${index}`,
      routerId: router.routerId,
      name: `Certification route ${index}`,
      target: { kind: "subflow", subflowId: targets[index % targets.length].subflowId },
      condition: { signalPath: `inputs.route${index}`, operator: "equals", expected: true },
      order: index,
      status: "active",
      createdAt: FIXED_NOW_MS + index,
      updatedAt: FIXED_NOW_MS + index,
    }));
    emitted += localCount;
  }
  if (emitted !== routeCount) throw new Error(`Expected ${routeCount} routes, generated ${emitted}.`);
}

function expandRunEvents(runDetails, eventCount) {
  let emitted = 0;
  for (let runIndex = 0; runIndex < runDetails.length; runIndex += 1) {
    const detail = runDetails[runIndex];
    const remainingRuns = runDetails.length - runIndex;
    const localCount = Math.floor((eventCount - emitted) / remainingRuns);
    detail.actionAttempts = Array.from({ length: localCount }, (_, index) => ({
      attemptId: `attempt.phase8.${runIndex}.${index}`,
      nodeId: `node.stress.${index % Math.max(1, localCount)}`,
      definitionId: "builtin.policy.action",
      order: index,
      status: index % 37 === 0 ? "failed" : "succeeded",
      route: "success",
      startedAt: FIXED_NOW_MS + index,
      finishedAt: FIXED_NOW_MS + index + 1,
      durationMs: 1,
    }));
    detail.summary.actionAttemptCount = localCount;
    emitted += localCount;
  }
  if (emitted !== eventCount) throw new Error(`Expected ${eventCount} run events, generated ${emitted}.`);
}

async function writeNdjson(target, count, create) {
  const handle = await open(target, "w");
  try {
    const batchSize = 1_000;
    for (let start = 0; start < count; start += batchSize) {
      const end = Math.min(count, start + batchSize);
      let payload = "";
      for (let index = start; index < end; index += 1) payload += `${JSON.stringify(create(index))}\n`;
      await handle.write(payload);
    }
  } finally {
    await handle.close();
  }
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
  const recordingId = projectOwnedRecordingId(projectId, "ui-stress-timeline");
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
  return recordingId;
}

async function persistFixtureRecording(projectId, recording, purpose) {
  const recordingId = projectOwnedRecordingId(projectId, purpose);
  await studio.createRecording({
    projectId,
    recordingId,
    ...(recording.taskId ? { taskId: `${recording.taskId}.${projectId}` } : {}),
    startedAt: recording.startedAt,
    environment: recording.environment,
    sources: recording.sources,
    actionChannels: recording.actionChannels,
    initialState: recording.initialState,
    metadata: {
      ...(recording.metadata ?? {}),
      projectId,
      fixtureOwned: true,
      sourceRecordingId: recording.recordingId,
    },
  });
  if (recording.timeline.length > 0) {
    await studio.appendRecordingEvents({ projectId, recordingId, entries: recording.timeline });
  }
  if (recording.endedAt !== undefined) {
    await studio.finalizeRecording({ projectId, recordingId, endedAt: recording.endedAt });
  }
  return recordingId;
}

function projectOwnedRecordingId(projectId, purpose) {
  return `recording.${projectId}.${purpose}`;
}

function phase8RecordingHierarchyNodes(flow, recordingIds, recordingLabels, profileName) {
  if (!flow?.flowId) return [];
  const parentId = `flow-${hierarchyStableNodeId(flow.flowId)}-recordings`;
  return recordingIds.map((recordingId, index) => ({
    id: `fixture-recording-${profileName}-${index}`,
    label: recordingLabels[index],
    kind: "recording",
    category: "flow",
    parentId,
    viewId: "timeline-recording",
    sourceId: recordingId,
    recordingId,
    flowId: flow.flowId,
  }));
}

function hierarchyStableNodeId(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
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
