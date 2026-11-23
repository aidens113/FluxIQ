// @fluxiq-test-group real-sql
import { afterEach, expect, it, vi } from "vitest";
import { automationStudioAnswerFirstCarryOn } from "../../carry-on/index.ts";
import { automationStudioAnswerFirstAttemptStoreOf } from "../../attempt-store/index.ts";
import { complete, READ_LOANS, toolCall } from "../../tests/fake-library.ts";
import { laterAttempts, readLoans } from "../../tests/later-attempts.ts";

vi.setConfig({ testTimeout: 120_000 });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const close of cleanups.splice(0)) await close();
});

it("reopens a stopped ending's failed retirement through actual copy receipts and retries only its exact publication", async () => {
  const instruction = "List all my loans with columns title only.";
  const rawDataset = "step.raw-user-owned";
  const firstLane = await laterAttempts(cleanups);
  const generate = firstLane.service.generateFlowBootstrapAdaptation.bind(firstLane.service);
  vi.spyOn(firstLane.service, "generateFlowBootstrapAdaptation").mockImplementation((input) => generate({ ...input, taskProcessing: { process: { columns: ["title"] } } }));
  const handler = firstLane.service.runDatasets.recordBatchHandler.bind(firstLane.service.runDatasets);
  let rawAdded = false;
  vi.spyOn(firstLane.service.runDatasets, "recordBatchHandler").mockImplementation((projectId, runId) => {
    const write = handler(projectId, runId);
    return async (batch) => {
      const saved = await write(batch);
      if (!rawAdded) {
        rawAdded = true;
        await write({ ...batch, nodeId: "fixture.unrelated-raw", attemptId: "raw-user-owned", batchKey: "raw-user-owned", datasetId: rawDataset });
      }
      return saved;
    };
  });
  let denyRetirement = false;
  let failedRetirements = 0;
  const retire = firstLane.service.runDatasets.deleteRunDatasets.bind(firstLane.service.runDatasets);
  vi.spyOn(firstLane.service.runDatasets, "deleteRunDatasets").mockImplementation(async (input) => {
    if (denyRetirement) {
      failedRetirements += 1;
      throw new Error("Fixture retirement storage is temporarily unavailable.");
    }
    return await retire(input);
  });
  const first = await firstLane.attempt({ instruction, script: [readLoans(), () => {
    denyRetirement = true;
    return toolCall("amend", "core.set_result_processing", { process: { where: [{ field: "due", atMost: "1900-01-01", as: "date" }], columns: ["title"] }, why: "This temporary erroneous date restriction leaves no qualifying answer; do not keep publishing the earlier ready answer." });
  }, complete("The unready empty selection must refuse this completion.")] });
  expect(first.answer.attempt.status).toBe("stopped_by_person");
  expect(first.answer.result?.rows).toBeUndefined();
  expect(failedRetirements).toBeGreaterThan(0);
  const before = (await firstLane.rows()).at(-1)!;
  expect(before.publications).toMatchObject({ version: 1, complete: true });
  expect(before.publications?.knownDatasetIds).toHaveLength(1);
  const publication = before.publications!.knownDatasetIds[0]!;
  expect(publication).not.toBe(rawDataset);
  const oldPage = await firstLane.service.runDatasets.getRunDatasetPage({ projectId: firstLane.projectId, runId: first.answer.attempt.runId!, datasetId: publication }, { retained: "answer" });
  expect(oldPage?.rows).toEqual(firstLane.target.library.loans);
  const reads = firstLane.target.library.calls.filter((call) => call.value.node === READ_LOANS).length;
  const restart = firstLane.restart();
  await firstLane.service.close();
  const secondLane = await laterAttempts(cleanups, { restart });
  const retried = vi.spyOn(secondLane.service.runDatasets, "deleteRunDatasets");
  const carried = await automationStudioAnswerFirstCarryOn(secondLane.service, secondLane.stores, { projectId: secondLane.projectId, attemptId: first.answer.attempt.attemptId, addUsd: 0.1 }, () => secondLane.attempt({ instruction, script: [toolCall("repair", "core.set_result_processing", { process: { columns: ["title"] }, why: "The request asks for every loan, with no date restriction. Remove the erroneous date bound and retain those same actual originals." }), complete("Listed all loans from the retained originals.")] }));
  if (!carried.ok) throw new Error(carried.refused);
  const second = await carried.finished;
  expect(second.answer.attempt.status).toBe("achieved");
  expect(second.answer.attempt.attemptId).toBe(first.answer.attempt.attemptId);
  expect(second.answer.attempt.runId).not.toBe(first.answer.attempt.runId);
  expect(retried).toHaveBeenCalledWith({ projectId: secondLane.projectId, runId: second.answer.attempt.runId, datasetId: publication });
  expect(retried).not.toHaveBeenCalledWith(expect.objectContaining({ datasetId: rawDataset }));
  expect(secondLane.target.library.calls.filter((call) => call.value.node === READ_LOANS)).toHaveLength(reads);
  const after = (await secondLane.rows()).at(-1)!;
  expect(after.processingReferenceTimeMs).toBe(before.processingReferenceTimeMs);
  expect(after.resultEvidence?.pages.flatMap((page) => page.rows)).toEqual(before.resultEvidence?.pages.flatMap((page) => page.rows));
  expect(after.publications).toMatchObject({ complete: true });
  const result = second.answer.result!.rows!;
  const selected = await secondLane.service.runDatasets.getRunDatasetPage({ projectId: secondLane.projectId, runId: result.runId, datasetId: result.datasetId }, { retained: "answer" });
  expect(selected?.rows).toEqual(secondLane.target.library.loans);
  expect(selected?.displayColumns?.map((column) => column.id)).toEqual(["title"]);
  const raw = await secondLane.service.runDatasets.getRunDatasetPage({ projectId: secondLane.projectId, runId: result.runId, datasetId: rawDataset }, { retained: "collected" });
  expect(raw?.rows).toEqual(secondLane.target.library.loans);
});

it("keeps optional tracking unavailability explicit after real restart, preserving the task/source clock without accepting completion", async () => {
  const instruction = "List every loan with columns title only.";
  const firstLane = await laterAttempts(cleanups);
  const generate = firstLane.service.generateFlowBootstrapAdaptation.bind(firstLane.service);
  vi.spyOn(firstLane.service, "generateFlowBootstrapAdaptation").mockImplementation((input) => generate({ ...input, taskProcessing: { process: { columns: ["title"] } } }));
  const first = await firstLane.attempt({ instruction, script: [readLoans()] });
  expect(first.answer.attempt.status).toBe("stopped_by_person");
  const before = (await firstLane.rows()).at(-1)!;
  expect(before.result?.rows?.totalRows).toBe(3);
  const store = automationStudioAnswerFirstAttemptStoreOf(firstLane.service, firstLane.stores);
  await store.save(firstLane.projectId, first.flowId, { ...before, publications: { version: 1, knownDatasetIds: [], complete: false } });
  const retained = (await store.get(firstLane.projectId, first.flowId, before.attempt.attemptId))!;
  expect(retained.result).toEqual(before.result);
  expect(retained.resultEvidence).toEqual(before.resultEvidence);
  expect(retained.processingReferenceTimeMs).toBe(before.processingReferenceTimeMs);
  const restart = firstLane.restart();
  await firstLane.service.close();
  const secondLane = await laterAttempts(cleanups, { restart });
  const carried = await automationStudioAnswerFirstCarryOn(secondLane.service, secondLane.stores, { projectId: secondLane.projectId, attemptId: first.answer.attempt.attemptId, addUsd: 0.1 }, () => secondLane.attempt({ instruction, script: [complete("Unavailable publication tracking must refuse this completion.")] }));
  if (!carried.ok) throw new Error(carried.refused);
  const second = await carried.finished;
  expect(second.answer.attempt.status).toBe("stopped_by_person");
  expect(second.answer.result?.rows).toBeUndefined();
  expect(second.judgeCalls).toHaveLength(0);
  expect(second.decisions.some((request) => JSON.stringify(request.context.evidenceLoop?.evidence)?.includes("pending-publication metadata is unavailable"))).toBe(true);
  const after = (await secondLane.rows()).at(-1)!;
  expect(after.publications).toEqual({ version: 1, knownDatasetIds: [], complete: false });
  expect(after.processingReferenceTimeMs).toBe(before.processingReferenceTimeMs);
  expect(after.resultEvidence?.pages.flatMap((page) => page.rows)).toEqual(before.resultEvidence?.pages.flatMap((page) => page.rows));
});
