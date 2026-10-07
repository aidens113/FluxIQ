import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AutomationStudioFlowCandidateDraftStore, type AutomationStudioFlowCandidateDraftRecord } from "../index.ts";
import { AutomationStudioFlowPaths, AutomationStudioProjectPaths } from "../../paths/index.ts";
import { AutomationStudioBootstrapAdaptationStore } from "../../bootstrap-adaptations.ts";
import type { AutomationStudioProjectStore } from "../../projects/index.ts";

const projects = { ensureProjectStructure: async () => undefined } as unknown as AutomationStudioProjectStore;
const record = (): AutomationStudioFlowCandidateDraftRecord => ({
  kind: "flow_candidate_draft", schemaVersion: 1, status: "draft", verification: "not_performed", candidateId: "candidate.1", projectId: "project.1", flowId: "flow.1",
  sourceInstructionIds: ["instruction.1"], instructionText: "Find the requested records.", baseSettingsRevision: 1, createdAt: 10,
  accounting: { requestId: "request.1", estimatedInputTokens: 10 },
  candidate: { revision: 1, digest: "a".repeat(64), baseDependencyDigest: "base", status: "draft", summary: "Unverified candidate", changedPaths: ["plan"], buildPlan: { plan: { summary: "Unverified candidate", router: { rules: [] }, subflows: [] } } as unknown as AutomationStudioFlowCandidateDraftRecord["candidate"]["buildPlan"] }
});

describe.each([false, true])("candidate drafts persist separately (SQLite=%s)", sqlite => {
  it("survives a new store and is never listed as an adaptation", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-candidate-draft-"));
    try {
      if (sqlite) await writeFile(path.join(root, "config.json"), JSON.stringify({ layoutVersion: 2 }));
      const paths = new AutomationStudioProjectPaths(path.join(root, "programs", "automation-studio", "projects"));
      const flows = new AutomationStudioFlowPaths(paths);
      const saved = record();
      await new AutomationStudioFlowCandidateDraftStore(paths, flows, projects).save(saved);
      saved.candidate.summary = "caller mutation";
      const loaded = await new AutomationStudioFlowCandidateDraftStore(paths, flows, projects).get("project.1", "flow.1");
      expect(loaded).toEqual(record());
      const held = new AutomationStudioFlowCandidateDraftStore(paths, flows, projects);
      await held.save(record());
      const updated = record(); updated.candidateId = "candidate.new"; updated.candidate.revision = 2;
      await new AutomationStudioFlowCandidateDraftStore(paths, flows, projects).save(updated);
      expect((await held.get("project.1", "flow.1"))?.candidateId).toBe("candidate.1");
      expect((await held.getAuthoritative("project.1", "flow.1"))?.candidateId).toBe("candidate.new");
      expect(await new AutomationStudioBootstrapAdaptationStore(paths, flows, projects).listFlowBootstrapAdaptations("project.1", "flow.1")).toEqual([]);
      expect(await new AutomationStudioFlowCandidateDraftStore(paths, flows, projects).get("project.1", "other.flow")).toBeUndefined();
    } finally { await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 }); }
  });
});

it("a cancelled save writes no candidate", async () => {
  const paths = new AutomationStudioProjectPaths(undefined);
  const store = new AutomationStudioFlowCandidateDraftStore(paths, new AutomationStudioFlowPaths(paths), projects);
  const abort = new AbortController(); abort.abort();
  await expect(store.save(record(), abort.signal)).rejects.toThrow();
  expect(await store.get("project.1", "flow.1")).toBeUndefined();
});
