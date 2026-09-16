// The two 10,000-item cases carry their own 60s budget rather than the suite's
// 15s. They do real work - one measured 8.6s alone - and after the runtime
// tests were split across more files, contention pushed them past a limit that
// exists to catch HANGS, not to size heavy fixtures. Raising the global timeout
// would blunt it for 700-odd tests to accommodate two, and capping workers
// would cost the whole suite its wall time. Nothing is weakened: the speed
// guarantee here is asserted explicitly (pageElapsedMs/searchElapsedMs under
// 500ms), so the timeout was never what held performance honest.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAutomationStudioFlowExpansionFixture, createAutomationStudioLargeProjectFixture } from "../../../../model/index.ts";
import { AutomationStudioService } from "../../../service.ts";
import type { JsonObject } from "../../../../../../core/index.ts";
import { SQLiteRepository } from "../../../../../database-manager/storage/sqlite-repository.ts";

let tempRoot: string;

const services = new Set<AutomationStudioService>();

function createService(...args: ConstructorParameters<typeof AutomationStudioService>): AutomationStudioService {
  const service = new AutomationStudioService(...args);
  services.add(service);
  return service;
}

describe("AutomationStudioService recording persistence", () => {
  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-automation-studio-service-"));
  });

  afterEach(async () => {
    await Promise.all([...services].map((service) => service.close()));
    services.clear();
    await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  });

  it("persists Flow expansion summaries with paged run and adaptation detail reads", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Expansion Pages" });
    const flow = await service.createFlow({ projectId: project.id, flowId: "flow.expansion-pages", name: "Expansion Pages Flow" });
    const fixture = createAutomationStudioFlowExpansionFixture(10_000);
    const subflows = await Promise.all(fixture.subflows.map((candidate) => service.createFlowSubflow({
      projectId: project.id,
      flowId: flow.flowId,
      name: candidate.name,
      ...(candidate.description ? { description: candidate.description } : {}),
      role: candidate.role,
      ...(candidate.routeTags ? { routeTags: candidate.routeTags } : {})
    })));
    await service.saveFlowRouter({
      ...fixture.router,
      projectId: project.id,
      flowId: flow.flowId,
      rules: fixture.router.rules.map((rule) => ({ ...rule, target: { kind: "subflow", subflowId: subflows[0]!.subflowId } })),
      fallback: { kind: "subflow", subflowId: subflows[1]!.subflowId }
    });
    await service.saveFlowInstruction(project.id, { ...fixture.instructions[0]!, scope: { kind: "flow", projectId: project.id, flowId: flow.flowId } });
    await service.saveFlowChangeProposal({ ...fixture.changeProposal, projectId: project.id, flowId: flow.flowId, subflowId: subflows[1]!.subflowId });
    const { proposalId: _missingProposalId, ...adaptationWithoutProposal } = fixture.adaptation;
    await expect(service.saveFlowAdaptation({ ...adaptationWithoutProposal, projectId: project.id, flowId: flow.flowId, subflowId: subflows[1]!.subflowId })).resolves.toMatchObject({
      adaptationId: fixture.adaptation.adaptationId,
      status: "validated"
    });

    for (let index = 0; index < 35; index += 1) {
      const runId = `run.expansion.${index}`;
      await service.saveFlowRunDetail({
        ...fixture.runDetail,
        summary: {
          ...fixture.runSummary,
          projectId: project.id,
          flowId: flow.flowId,
          runId,
          updatedAt: 20_000 + index,
          routeDecisionCount: 1,
          subflowEntryCount: 1,
          actionAttemptCount: index
        },
        routeDecisions: [{ ...fixture.runDetail.routeDecisions[0]!, decisionId: `decision.${index}`, selectedSubflowId: subflows[0]!.subflowId }],
        subflows: [{ ...fixture.runDetail.subflows[0]!, entryId: `entry.${index}`, subflowId: subflows[0]!.subflowId }],
        interventions: [],
        actionAttempts: Array.from({ length: index }, (_, actionIndex) => ({ ...(fixture.runDetail.actionAttempts ?? [])[0]!, attemptId: `attempt.${index}.${actionIndex}`, order: actionIndex }))
      });
    }

    for (let index = 0; index < 12; index += 1) {
      await service.saveFlowAdaptation({
        ...fixture.adaptation,
        projectId: project.id,
        flowId: flow.flowId,
        subflowId: subflows[1]!.subflowId,
        adaptationId: `adaptation.expansion.${index}`,
        updatedAt: 30_000 + index,
        trigger: `Observed drift ${index}`
      });
    }

    const runPage = await service.listFlowRunSummaries({ projectId: project.id, flowId: flow.flowId, limit: 5, offset: 10 });
    expect(runPage).toMatchObject({ total: 35, limit: 5, offset: 10 });
    expect(runPage.runs.map((run) => run.runId)).toEqual(["run.expansion.24", "run.expansion.23", "run.expansion.22", "run.expansion.21", "run.expansion.20"]);
    expect(runPage.runs[0]).not.toHaveProperty("routeDecisions");
    const searchedRunId = runPage.runs[0]!.runId;
    const searchedRuns = await service.listFlowRunSummaries({ projectId: project.id, flowId: flow.flowId, search: searchedRunId.toUpperCase(), limit: 25, offset: 0 });
    expect(searchedRuns).toMatchObject({ total: 1, limit: 25, offset: 0 });
    expect(searchedRuns.runs.map((run) => run.runId)).toEqual([searchedRunId]);
    const selectedStatus = runPage.runs[0]!.status;
    const statusRuns = await service.listFlowRunSummaries({ projectId: project.id, flowId: flow.flowId, status: selectedStatus, sort: "status", direction: "asc", limit: 100, offset: 0 });
    expect(statusRuns.total).toBeGreaterThan(0);
    expect(statusRuns.runs.every((run) => run.status === selectedStatus)).toBe(true);
    const actionSortedRuns = await service.listFlowRunSummaries({ projectId: project.id, flowId: flow.flowId, sort: "actions", direction: "desc", limit: 100, offset: 0 });
    expect(actionSortedRuns.runs.every((run, index, runs) => index === 0 || runs[index - 1]!.actionAttemptCount >= run.actionAttemptCount)).toBe(true);
    const actionPage = await service.listFlowRunActions({ projectId: project.id, runId: "run.expansion.24", limit: 5, offset: 10 });
    expect(actionPage).toMatchObject({ total: 24, limit: 5, offset: 10 });
    expect(actionPage.actions.map((action) => action.attemptId)).toEqual(["attempt.24.10", "attempt.24.11", "attempt.24.12", "attempt.24.13", "attempt.24.14"]);
    expect(actionPage.actions.every((action) => action.order >= 10 && action.order <= 14)).toBe(true);
    const selectedRun = await service.getFlowRunDetail(project.id, "run.expansion.24");
    expect(selectedRun?.routeDecisions).toEqual([expect.objectContaining({ decisionId: "decision.24" })]);

    const adaptationPage = await service.listFlowAdaptationSummaries({ projectId: project.id, flowId: flow.flowId, subflowId: subflows[1]!.subflowId, limit: 4, offset: 3 });
    expect(adaptationPage).toMatchObject({ total: 13, limit: 4, offset: 3 });
    expect(adaptationPage.adaptations.map((adaptation) => adaptation.adaptationId)).toEqual(["adaptation.expansion.8", "adaptation.expansion.7", "adaptation.expansion.6", "adaptation.expansion.5"]);
    expect(await service.getFlowAdaptation(project.id, flow.flowId, "adaptation.expansion.8")).toMatchObject({ trigger: "Observed drift 8" });

    await expect(service.listFlowSubflowSummaries({ projectId: project.id, flowId: flow.flowId })).resolves.toMatchObject({ total: 2 });
    await expect(service.getFlowInstructionSet({ projectId: project.id, flowId: flow.flowId })).resolves.toHaveLength(1);
    await expect(service.getFlowChangeProposal(project.id, flow.flowId, fixture.changeProposal.proposalId)).resolves.toMatchObject({ proposalId: fixture.changeProposal.proposalId });
  });

  it("keeps large project summary pages free of hydrated detail payloads", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Large Summary Guard" });
    const fixture = createAutomationStudioLargeProjectFixture({
      projectId: project.id,
      flowCount: 2,
      subflowsPerFlow: 6,
      runsPerFlow: 18,
      adaptationsPerFlow: 8,
      instructionsPerFlow: 10,
      recordingCount: 4,
      nowMs: 60_000
    });
    const [flow] = fixture.flows;
    if (!flow) throw new Error("Large fixture did not create a flow.");

    for (const artifact of fixture.flows) await service.saveFlow({ projectId: project.id, flow: artifact });
    const subflowIdMap = new Map<string, string>();
    for (const subflow of fixture.subflows) {
      const created = await service.createFlowSubflow({
        projectId: project.id,
        flowId: subflow.flowId,
        name: subflow.name,
        ...(subflow.description ? { description: subflow.description } : {}),
        role: subflow.role,
        ...(subflow.routeTags ? { routeTags: subflow.routeTags } : {})
      });
      subflowIdMap.set(subflow.subflowId, created.subflowId);
    }
    const mappedSubflowId = (subflowId: string) => subflowIdMap.get(subflowId) ?? subflowId;
    for (const router of fixture.routers) await service.saveFlowRouter({
      ...router,
      rules: router.rules.map((rule) => ({ ...rule, target: { ...rule.target, subflowId: mappedSubflowId(rule.target.subflowId) } })),
      ...(router.fallback ? { fallback: router.fallback.kind === "subflow" ? { ...router.fallback, subflowId: mappedSubflowId(router.fallback.subflowId) } : router.fallback } : {})
    });
    for (const instruction of fixture.instructions) await service.saveFlowInstruction(project.id, {
      ...instruction,
      scope: instruction.scope.kind === "subflow" ? { ...instruction.scope, subflowId: mappedSubflowId(instruction.scope.subflowId) } : instruction.scope
    });
    for (const proposal of fixture.changeProposals) await service.saveFlowChangeProposal({
      ...proposal,
      ...(proposal.subflowId ? { subflowId: mappedSubflowId(proposal.subflowId) } : {}),
      patches: proposal.patches.map((patch) => patch.targetId && subflowIdMap.has(patch.targetId) ? { ...patch, targetId: mappedSubflowId(patch.targetId) } : patch)
    });
    for (const adaptation of fixture.adaptations) await service.saveFlowAdaptation({
      ...adaptation,
      ...(adaptation.subflowId ? { subflowId: mappedSubflowId(adaptation.subflowId) } : {})
    });
    for (const detail of fixture.runDetails) await service.saveFlowRunDetail({
      ...detail,
      routeDecisions: detail.routeDecisions.map((decision) => ({ ...decision, ...(decision.selectedSubflowId ? { selectedSubflowId: mappedSubflowId(decision.selectedSubflowId) } : {}) })),
      subflows: detail.subflows.map((entry) => ({ ...entry, subflowId: mappedSubflowId(entry.subflowId) }))
    });


    const subflowPage = await service.listFlowSubflowSummaries({ projectId: project.id, flowId: flow.flowId, limit: 5, offset: 2 });
    const instructionPage = await service.listFlowInstructionSummaries({ projectId: project.id, flowId: flow.flowId, limit: 5, offset: 4 });
    const proposalPage = await service.listFlowChangeProposalSummaries({ projectId: project.id, flowId: flow.flowId, limit: 5, offset: 1 });
    const runPage = await service.listFlowRunSummaries({ projectId: project.id, flowId: flow.flowId, limit: 5, offset: 10 });
    const adaptationPage = await service.listFlowAdaptationSummaries({ projectId: project.id, flowId: flow.flowId, limit: 5, offset: 3 });

    expect(subflowPage).toMatchObject({ total: 6, limit: 5, offset: 2 });
    const filteredSubflows = await service.listFlowSubflowSummaries({ projectId: project.id, flowId: flow.flowId, role: subflowPage.subflows[0]!.role, search: subflowPage.subflows[0]!.name, sort: "name", direction: "asc", limit: 25, offset: 0 });
    expect(filteredSubflows.total).toBeGreaterThan(0);
    expect(filteredSubflows.subflows.every((subflow) => subflow.flowId === flow.flowId && subflow.role === subflowPage.subflows[0]!.role)).toBe(true);

    expect(instructionPage).toMatchObject({ total: 10, limit: 5, offset: 4 });
    const selectedInstructionSummary = instructionPage.instructions[0]!;
    const filteredInstructions = await service.listFlowInstructionSummaries({ projectId: project.id, flowId: flow.flowId, status: selectedInstructionSummary.status, scopeKind: selectedInstructionSummary.scopeKind, requirement: selectedInstructionSummary.requirement, search: selectedInstructionSummary.title, sort: "priority", direction: "asc", limit: 25, offset: 0 });
    expect(filteredInstructions.instructions).toContainEqual(expect.objectContaining({ instructionId: selectedInstructionSummary.instructionId, summaryVersion: 2 }));
    expect(proposalPage).toMatchObject({ limit: 5, offset: 1 });
    expect(runPage).toMatchObject({ total: 18, limit: 5, offset: 10 });
    expect(adaptationPage).toMatchObject({ total: 8, limit: 5, offset: 3 });
    const selectedAdaptationSummary = adaptationPage.adaptations[0]!;
    const filteredAdaptations = await service.listFlowAdaptationSummaries({
      projectId: project.id,
      flowId: flow.flowId,
      risk: selectedAdaptationSummary.riskLevel,
      search: selectedAdaptationSummary.trigger.toUpperCase(),
      sort: "trigger",
      direction: "asc",
      limit: 25,
      offset: 0
    });
    expect(filteredAdaptations.adaptations).toContainEqual(expect.objectContaining({ adaptationId: selectedAdaptationSummary.adaptationId, riskLevel: selectedAdaptationSummary.riskLevel }));
    expect(filteredAdaptations.adaptations.every((adaptation) => adaptation.riskLevel === selectedAdaptationSummary.riskLevel)).toBe(true);
    const riskSortedAdaptations = await service.listFlowAdaptationSummaries({ projectId: project.id, flowId: flow.flowId, sort: "risk", direction: "desc", limit: 100, offset: 0 });
    const riskRank = (value: string) => value === "destructive" ? 4 : value === "high" ? 3 : value === "medium" ? 2 : 1;
    expect(riskSortedAdaptations.adaptations.every((adaptation, index, adaptations) => index === 0 || riskRank(adaptations[index - 1]!.riskLevel) >= riskRank(adaptation.riskLevel))).toBe(true);

    expect(subflowPage.subflows[0]).not.toHaveProperty("inputMapping");
    expect(instructionPage.instructions[0]).not.toHaveProperty("body");
    expect(proposalPage.changeProposals[0]).not.toHaveProperty("patches");
    expect(runPage.runs[0]).not.toHaveProperty("routeDecisions");
    const searchedRunId = runPage.runs[0]!.runId;
    const searchedRuns = await service.listFlowRunSummaries({ projectId: project.id, flowId: flow.flowId, search: searchedRunId.toUpperCase(), limit: 25, offset: 0 });
    expect(searchedRuns).toMatchObject({ total: 1, limit: 25, offset: 0 });
    expect(searchedRuns.runs.map((run) => run.runId)).toEqual([searchedRunId]);
    const selectedStatus = runPage.runs[0]!.status;
    const statusRuns = await service.listFlowRunSummaries({ projectId: project.id, flowId: flow.flowId, status: selectedStatus, sort: "status", direction: "asc", limit: 100, offset: 0 });
    expect(statusRuns.total).toBeGreaterThan(0);
    expect(statusRuns.runs.every((run) => run.status === selectedStatus)).toBe(true);
    const actionSortedRuns = await service.listFlowRunSummaries({ projectId: project.id, flowId: flow.flowId, sort: "actions", direction: "desc", limit: 100, offset: 0 });
    expect(actionSortedRuns.runs.every((run, index, runs) => index === 0 || runs[index - 1]!.actionAttemptCount >= run.actionAttemptCount)).toBe(true);
    expect(runPage.runs[0]).not.toHaveProperty("interventions");
    const interventionRun = runPage.runs.find((run) => (run.interventionSummaries ?? []).length > 0);
    expect(interventionRun?.tokenUsage).toEqual({ inputTokens: 20, outputTokens: 10, totalTokens: 30, estimatedCostUsd: 0.002 });
    expect(interventionRun?.interventionSummaries?.[0]).toMatchObject({
      kind: "diagnosis",
      reason: "Large fixture diagnostic sample.",
      promptVersion: "diagnosis_only_report.v1",
      provider: "fixture",
      model: "fixture",
      tokenUsage: { totalTokens: 30, estimatedCostUsd: 0.002 }
    });
    expect(adaptationPage.adaptations[0]).not.toHaveProperty("patch");
    expect(adaptationPage.adaptations[0]).not.toHaveProperty("validationResults");

    await expect(service.getFlowInstruction(project.id, instructionPage.instructions[0]!.instructionId)).resolves.toHaveProperty("body");
    await expect(service.getFlowRunDetail(project.id, runPage.runs[0]!.runId)).resolves.toHaveProperty("routeDecisions");
    await expect(service.getFlowAdaptation(project.id, flow.flowId, adaptationPage.adaptations[0]!.adaptationId)).resolves.toHaveProperty("patch");

    await rm(path.join(tempRoot, "programs", "automation-studio", "projects", project.id, "flows", flow.flowId, "instructions"), { recursive: true, force: true });
    const metadataOnlyInstructions = await service.listFlowInstructionSummaries({ projectId: project.id, flowId: flow.flowId, limit: 10, offset: 0 });
    expect(metadataOnlyInstructions.instructions).toContainEqual(expect.objectContaining({ instructionId: selectedInstructionSummary.instructionId, title: selectedInstructionSummary.title }));
    expect(metadataOnlyInstructions.instructions[0]).not.toHaveProperty("body");
  }, 60_000);

  it("pages and filters 10,000 Subflow summaries within the local directory budget", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Subflow SQL Scale" });
    const flow = await service.createFlow({ projectId: project.id, flowId: "flow.subflow-scale", name: "Subflow Scale" });
    const repository = new SQLiteRepository<JsonObject>({
      rootDir: path.join(tempRoot, "programs", "automation-studio", "projects", project.id, "runtime", "sqlite"),
      kind: "flow.subflows",
      layoutVersion: 1
    });
    await repository.transaction({}, async (transaction) => {
      for (let index = 0; index < 10_000; index += 1) {
        const subflowId = `subflow.scale.${String(index).padStart(5, "0")}`;
        const data = {
          subflowId,
          summaryVersion: 2,
          graphFlowId: `${flow.flowId}.${subflowId}.graph`,
          flowId: flow.flowId,
          projectId: project.id,
          name: index === 9_999 ? "Needle Recovery" : `Subflow ${String(index).padStart(5, "0")}`,
          role: index === 9_999 ? "recovery" : "utility",
          status: index % 7 === 0 ? "disabled" : "active",
          updatedAt: 100_000 + index
        };
        await transaction.run(`insert into ${repository.tableName} (id, kind, data, created_at_ms, updated_at_ms) values (?, ?, ?, ?, ?)`, [subflowId, "flow.subflows", JSON.stringify(data), data.updatedAt, data.updatedAt]);
      }
    });

    const pageStartedAt = performance.now();
    const page = await service.listFlowSubflowSummaries({ projectId: project.id, flowId: flow.flowId, limit: 50, offset: 9_950, sort: "updated", direction: "asc" });
    const pageElapsedMs = performance.now() - pageStartedAt;
    const searchStartedAt = performance.now();
    const filtered = await service.listFlowSubflowSummaries({ projectId: project.id, flowId: flow.flowId, status: "active", role: "recovery", search: "needle", limit: 50, offset: 0 });
    const searchElapsedMs = performance.now() - searchStartedAt;

    expect(page).toMatchObject({ total: 10_000, limit: 50, offset: 9_950 });
    expect(page.subflows).toHaveLength(50);
    expect(page.subflows[0]).not.toHaveProperty("inputMapping");
    expect(filtered.subflows).toEqual([expect.objectContaining({ subflowId: "subflow.scale.09999", name: "Needle Recovery", role: "recovery", status: "active" })]);
    expect(pageElapsedMs).toBeLessThan(500);
    expect(searchElapsedMs).toBeLessThan(500);
  }, 60_000);
});
