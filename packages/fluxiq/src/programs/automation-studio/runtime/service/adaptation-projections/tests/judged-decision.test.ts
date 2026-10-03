import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AutomationStudioFlowAdaptation } from "../../../../model/index.ts";
import { createBlankAutomationStudioFlowArtifact } from "../../../../model/index.ts";
import { evaluateFlowAdaptationPromotionGates } from "../../../recovery/index.ts";
import { adaptationFromTypedStoreDetail, adaptationSummaryFromAdaptation } from "../index.ts";
import { adaptationSummaryFromTypedStore } from "../../summaries/index.ts";
import { AutomationStudioProjectAdaptationStore, AutomationStudioProjectDatabasePool, AutomationStudioProjectGraphRepository } from "../../../../storage/project/index.ts";

// A runtime patch is applied only after a whole judged run, and the judged
// settle records `applied` and, when held back, `notAppliedReason` on the
// adaptation's decision (`runtime/service/runtime-adaptation/judged-promotion.ts`).
// The web app's Adaptations view reads both from the adaptation that
// `get-flow-adaptation` returns, which is the typed store's detail run through
// `adaptationFromTypedStoreDetail`. These cases hold that path to carrying them,
// and the inbox rows (`list-flow-adaptations`) to carrying them as
// `judgedApplication`, from the typed store and from the JSON index alike.

let rootDir = "";
const PROJECT = "project.judged";

describe("a judged decision on a stored adaptation", () => {
  let pools: AutomationStudioProjectDatabasePool[] = [];
  beforeEach(async () => { rootDir = await mkdtemp(path.join(os.tmpdir(), "automation-studio-judged-decision-test-")); pools = []; });
  afterEach(async () => { await Promise.all(pools.map((pool) => pool.closeAll())); await rm(rootDir, { recursive: true, force: true }); });

  it("keeps a held-back patch's applied flag and reason through the store and the detail it is served as", async () => {
    const store = await openStore();
    const held = { autoApply: true, applyAt: "judged_whole_run", applied: false, notAppliedReason: "refuted", judgedRunId: "run.judged" };
    await store.putAdaptation({ adaptation: fixture("adaptation.held", held), changedAt: 20 });

    const detail = await store.getAdaptation("adaptation.held");
    expect(detail?.adaptation.metadata?.approvalDecision).toEqual(held);
    expect(adaptationFromTypedStoreDetail(detail!).metadata?.approvalDecision).toEqual(held);
    await store.close();
  });

  it("keeps an applied patch's applied flag once the apply has written it into the Flow", async () => {
    const store = await openStore();
    const recorded = { autoApply: true, applyAt: "judged_whole_run", applied: true, judgedRunId: "run.judged" };
    await store.putAdaptation({ adaptation: fixture("adaptation.applied", recorded), changedAt: 20 });

    const applied = await store.applyApprovedAdaptation({ promotionGates: evaluateFlowAdaptationPromotionGates, adaptationId: "adaptation.applied", actorId: "runtime", changedAt: 30, compile: false });
    expect(applied.adaptation.status).toBe("applied");
    const detail = await store.getAdaptation("adaptation.applied");
    expect(adaptationFromTypedStoreDetail(detail!)).toMatchObject({ status: "applied", metadata: { approvalDecision: recorded } });
    expect(adaptationFromTypedStoreDetail(detail!).metadata?.approvalDecision).not.toHaveProperty("notAppliedReason");
    await store.close();
  });

  it("lists each adaptation with whether its patch went into the Flow, and why not", async () => {
    const store = await openStore();
    await store.putAdaptation({ adaptation: fixture("adaptation.held", { autoApply: true, applied: false, notAppliedReason: "run_parked" }), changedAt: 20 });
    await store.putAdaptation({ adaptation: fixture("adaptation.waiting", { autoApply: true, applyAt: "judged_whole_run", applied: false }), changedAt: 21 });
    await store.putAdaptation({ adaptation: fixture("adaptation.manual", { autoApply: false, requiresManualApproval: true }), changedAt: 22 });

    const page = await store.listAdaptationsPage({ flowId: "flow.main", limit: 10, offset: 0 });
    const rows = Object.fromEntries(page.adaptations.map((row) => [row.adaptationId, adaptationSummaryFromTypedStore(row)]));
    expect(rows["adaptation.held"]?.judgedApplication).toEqual({ applied: false, notAppliedReason: "run_parked" });
    expect(rows["adaptation.waiting"]?.judgedApplication).toEqual({ applied: false });
    expect(rows["adaptation.manual"]).not.toHaveProperty("judgedApplication");
    await store.close();
  });

  it("lists the same from the JSON index a project without a database keeps", () => {
    expect(adaptationSummaryFromAdaptation(fixture("adaptation.applied", { autoApply: true, applied: true })).judgedApplication).toEqual({ applied: true });
    expect(adaptationSummaryFromAdaptation(fixture("adaptation.held", { applied: false, notAppliedReason: "refuted" })).judgedApplication).toEqual({ applied: false, notAppliedReason: "refuted" });
    expect(adaptationSummaryFromAdaptation(fixture("adaptation.manual", { autoApply: false }))).not.toHaveProperty("judgedApplication");
  });

  async function openStore(): Promise<AutomationStudioProjectAdaptationStore> {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    pools.push(pool);
    await seedFlow(pool);
    return await AutomationStudioProjectAdaptationStore.open({ pool, projectId: PROJECT });
  }
});

async function seedFlow(pool: AutomationStudioProjectDatabasePool): Promise<void> {
  const graph = await AutomationStudioProjectGraphRepository.open({ pool, projectId: PROJECT });
  const flow = createBlankAutomationStudioFlowArtifact({ flowId: "flow.main", projectId: PROJECT, name: "Main", now: 1 });
  flow.nodes = [{ id: "node.action", definitionId: "builtin.step", label: "Action", position: { x: 0, y: 0 }, parameterValues: { target: "#old" } }];
  await graph.importMonolithicFlowGraph(flow, { changedAt: 1 });
  await graph.close();
}

function fixture(adaptationId: string, approvalDecision: Record<string, string | boolean>): AutomationStudioFlowAdaptation {
  return {
    schemaVersion: "0.1",
    adaptationId,
    flowId: "flow.main",
    projectId: PROJECT,
    trigger: "Action target failed validation.",
    patch: [{ kind: "edit_action_target", targetId: "node.action", summary: "Change action target", before: "#old", after: { selector: "#submit" } }],
    validationResults: [{ runId: "run.judged", status: "succeeded", checkedAt: 10 }],
    status: "validated",
    author: "llm",
    riskLevel: "low",
    createdAt: 10,
    updatedAt: 10,
    metadata: { baseRevision: 1, proposalModeOverride: "auto", approvalDecision }
  };
}
