import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import { ProgramJsonStore } from "../../../../_shared/storage.ts";
import type { AutomationStudioBootstrapAdaptation } from "../../flow-bootstrap/index.ts";
import {
  AutomationStudioBootstrapAdaptationStore,
  AutomationStudioFlowPaths,
  AutomationStudioProjectPaths,
  type AutomationStudioProjectStore
} from "../index.ts";

// A bootstrap record written before modes, origins and node provenance existed
// must read in today's shape wherever the store hands one out. Apply compares
// the stored topology with a fresh normalization, which now stamps each node it
// creates with `adaptationIds`, so an older record that was approved but not yet
// applied can only still apply if every read upgrades it.

const PROJECT_ID = "project.bootstrap-reads";
const FLOW_ID = "flow.bootstrap-reads";
const ADAPTATION_ID = "adaptation.bootstrap.older";
const INSTRUCTION_ID = "instruction.build";

let tempRoot: string;

// Nothing in the store reads the project record; it only has to exist.
const projects = {
  findProject: async () => ({ id: PROJECT_ID }),
  ensureProjectStructure: async () => undefined
} as unknown as AutomationStudioProjectStore;

function olderRecord(): JsonObject {
  return {
    schemaVersion: "0.1",
    kind: "flow_bootstrap",
    adaptationId: ADAPTATION_ID,
    projectId: PROJECT_ID,
    flowId: FLOW_ID,
    baseDependencyDigest: "digest.base",
    baseSettingsRevision: 1,
    sourceInstructionIds: [INSTRUCTION_ID],
    summary: "Build the active instruction.",
    riskLevel: "low",
    buildPlan: {},
    topology: {
      subflows: [{
        graphFlow: {
          flowId: `${FLOW_ID}.graph`,
          nodes: [
            { id: "owned", definitionId: "builtin.control.start", parameterValues: {}, metadata: { bootstrapAdaptationId: ADAPTATION_ID } },
            { id: "foreign", definitionId: "builtin.control.end", parameterValues: {}, metadata: { bootstrapAdaptationId: "adaptation.bootstrap.other" } }
          ],
          edges: []
        }
      }]
    },
    status: "approved",
    createdAt: 1,
    updatedAt: 1,
    auditEvents: []
  };
}

function expectUpgraded(adaptation: AutomationStudioBootstrapAdaptation | null | undefined): void {
  expect(adaptation).toBeTruthy();
  expect(adaptation!.mode).toBe("create");
  expect(adaptation!.origin).toEqual({ entryPoint: "instruction", instructionIds: [INSTRUCTION_ID] });
  const [owned, foreign] = adaptation!.topology.subflows[0]!.graphFlow.nodes;
  expect(owned?.metadata).toEqual({ bootstrapAdaptationId: ADAPTATION_ID, adaptationIds: [ADAPTATION_ID] });
  expect(foreign?.metadata).toEqual({ bootstrapAdaptationId: "adaptation.bootstrap.other" });
}

describe.each([
  { layout: "plain JSON files", sqlite: false },
  { layout: "SQLite program state", sqlite: true }
])("reading an older bootstrap record from $layout", ({ sqlite }) => {
  let store: AutomationStudioBootstrapAdaptationStore;
  let flowPaths: AutomationStudioFlowPaths;

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-bootstrap-reads-"));
    // A layout-2 data directory routes every program-state path into SQLite,
    // and the store's listings then read the projected documents.
    if (sqlite) await writeFile(path.join(tempRoot, "config.json"), JSON.stringify({ layoutVersion: 2 }), "utf8");
    const projectPaths = new AutomationStudioProjectPaths(path.join(tempRoot, "programs", "automation-studio", "projects"));
    flowPaths = new AutomationStudioFlowPaths(projectPaths);
    store = new AutomationStudioBootstrapAdaptationStore(projectPaths, flowPaths, projects);
    await new ProgramJsonStore<JsonObject>(flowPaths.flowBootstrapAdaptationFile(PROJECT_ID, FLOW_ID, ADAPTATION_ID), () => ({})).write(olderRecord());
    // The project-wide listing finds Flows by their directories on disk. Under
    // SQLite program state this store writes none; a service's other writers do.
    if (sqlite) await mkdir(flowPaths.flowDirectory(PROJECT_ID, FLOW_ID), { recursive: true });
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  });

  it("upgrades it when read by id, and keeps the upgraded copy for the next read", async () => {
    expectUpgraded(await store.getFlowBootstrapAdaptation(PROJECT_ID, FLOW_ID, ADAPTATION_ID));
    expectUpgraded(await store.getFlowBootstrapAdaptation(PROJECT_ID, FLOW_ID, ADAPTATION_ID));
  });

  it("upgrades it when a Flow's records are listed", async () => {
    const listed = await store.listFlowBootstrapAdaptations(PROJECT_ID, FLOW_ID);
    expect(listed).toHaveLength(1);
    expectUpgraded(listed[0]);
  });

  it("upgrades it when a project's records are listed", async () => {
    const listed = await store.listProjectFlowBootstrapAdaptations(PROJECT_ID);
    expect(listed).toHaveLength(1);
    expectUpgraded(listed[0]);
  });

  // Only a missing directory holds no records; one that cannot be listed is an
  // error. Under SQLite program state the adaptations are not listed from disk.
  it.runIf(!sqlite)("fails a listing whose adaptations directory cannot be read, rather than listing nothing", async () => {
    const broken = flowPaths.flowAdaptationsDirectory(PROJECT_ID, "flow.broken");
    await mkdir(path.dirname(broken), { recursive: true });
    await writeFile(broken, "not a directory", "utf8");

    await expect(store.listFlowBootstrapAdaptations(PROJECT_ID, "flow.broken")).rejects.toMatchObject({ code: "ENOTDIR" });
    await expect(store.listProjectFlowBootstrapAdaptations(PROJECT_ID)).rejects.toMatchObject({ code: "ENOTDIR" });
    await expect(store.listFlowBootstrapAdaptations(PROJECT_ID, "flow.never-written")).resolves.toEqual([]);
  });
});
