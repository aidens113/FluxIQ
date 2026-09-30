import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import { ProgramJsonStore } from "../../../../_shared/storage.ts";
import { automationStudioFlowBootstrapIncompleteDraftKept, type AutomationStudioFlowBootstrapIncompleteDraft } from "../../flow-bootstrap/index.ts";
import {
  AutomationStudioBootstrapAdaptationStore,
  AutomationStudioFlowBootstrapIncompleteDraftStore,
  AutomationStudioFlowPaths,
  AutomationStudioProjectPaths,
  type AutomationStudioProjectStore
} from "../index.ts";

// The incomplete draft a stopped build keeps survives the service, in either
// storage layout, and is never mistaken for an adaptation.

const PROJECT_ID = "project.incomplete";
const FLOW_ID = "flow.incomplete";

const projects = {
  findProject: async () => ({ id: PROJECT_ID }),
  requireProject: async () => undefined,
  ensureProjectStructure: async () => undefined
} as unknown as AutomationStudioProjectStore;

function record(): AutomationStudioFlowBootstrapIncompleteDraft {
  return automationStudioFlowBootstrapIncompleteDraftKept({
    projectId: PROJECT_ID, flowId: FLOW_ID, baseDependencyDigest: "digest", sourceInstructionIds: ["i1"], stopped: "iterations",
    outstandingIssueCodes: ["plan.profile_limit_exceeded"], completionAttempts: 2, now: 10,
    steps: [{ position: 1, id: "d1", iteration: 1, callId: "c1", actionId: "web.navigate", input: {}, effect: "mutate", effectApplied: true, disposition: "kept" }]
  })!;
}

describe.each([
  { layout: "plain JSON files", sqlite: false },
  { layout: "SQLite program state", sqlite: true }
])("the incomplete-draft store over $layout", ({ sqlite }) => {
  let tempRoot: string;
  let projectPaths: AutomationStudioProjectPaths;
  let flowPaths: AutomationStudioFlowPaths;

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-incomplete-drafts-"));
    if (sqlite) await writeFile(path.join(tempRoot, "config.json"), JSON.stringify({ layoutVersion: 2 }), "utf8");
    projectPaths = new AutomationStudioProjectPaths(path.join(tempRoot, "programs", "automation-studio", "projects"));
    flowPaths = new AutomationStudioFlowPaths(projectPaths);
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  });

  it("reads back, from a fresh store, what an earlier one wrote", async () => {
    await new AutomationStudioFlowBootstrapIncompleteDraftStore(projectPaths, flowPaths, projects).save(record());
    await expect(new AutomationStudioFlowBootstrapIncompleteDraftStore(projectPaths, flowPaths, projects).get(PROJECT_ID, FLOW_ID)).resolves.toEqual(record());
  });

  it("is gone, for a fresh store too, once deleted", async () => {
    const store = new AutomationStudioFlowBootstrapIncompleteDraftStore(projectPaths, flowPaths, projects);
    await store.save(record());
    await store.delete(PROJECT_ID, FLOW_ID);
    await expect(store.get(PROJECT_ID, FLOW_ID)).resolves.toBeUndefined();
    await expect(new AutomationStudioFlowBootstrapIncompleteDraftStore(projectPaths, flowPaths, projects).get(PROJECT_ID, FLOW_ID)).resolves.toBeUndefined();
    // Deleting what is not there is not an error.
    await expect(store.delete(PROJECT_ID, FLOW_ID)).resolves.toBeUndefined();
  });

  it("holds nothing for a Flow that never stopped short, or whose file Core did not write", async () => {
    const store = new AutomationStudioFlowBootstrapIncompleteDraftStore(projectPaths, flowPaths, projects);
    await expect(store.get(PROJECT_ID, FLOW_ID)).resolves.toBeUndefined();
    await new ProgramJsonStore<JsonObject>(path.join(flowPaths.flowDirectory(PROJECT_ID, FLOW_ID), "incomplete-draft.json"), () => ({})).write({ ...record(), status: "proposed" } as unknown as JsonObject);
    await expect(store.get(PROJECT_ID, FLOW_ID)).resolves.toBeUndefined();
  });

  it("is never listed as an adaptation", async () => {
    await new AutomationStudioFlowBootstrapIncompleteDraftStore(projectPaths, flowPaths, projects).save(record());
    await expect(new AutomationStudioBootstrapAdaptationStore(projectPaths, flowPaths, projects).listFlowBootstrapAdaptations(PROJECT_ID, FLOW_ID)).resolves.toEqual([]);
  });
});
