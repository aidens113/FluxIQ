// @fluxiq-test-group real-sql
import { afterEach, expect, it, vi } from "vitest";
import type { AutomationStudioFlowTaskProcessing } from "../../../../../../runtime/flow-authoring/draft/index.ts";
import { automationStudioAnswerFirstCarryOn } from "../../carry-on/index.ts";
import { complete, READ_LOANS, toolCall } from "../../tests/fake-library.ts";
import { laterAttempts, readLoans } from "../../tests/later-attempts.ts";

vi.setConfig({ testTimeout: 120_000 });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { vi.restoreAllMocks(); for (const close of cleanups.splice(0)) await close(); });
const INSTRUCTION = "List every loan due on or before 2 January 2030, ordered alphabetically by title, with columns title only.";
const CRITERIA = { where: [{ field: "due", atMost: "2030-01-02", as: "date" }], sort: [{ field: "title", order: "asc", as: "text" }], columns: ["title"] };

async function laneWith(declaration: AutomationStudioFlowTaskProcessing | undefined) {
  const lane = await laterAttempts(cleanups);
  const generate = lane.service.generateFlowBootstrapAdaptation.bind(lane.service);
  if (declaration !== undefined) vi.spyOn(lane.service, "generateFlowBootstrapAdaptation").mockImplementation((input) => generate({ ...input, taskProcessing: declaration }));
  return lane;
}

it("applies one declaration on exploration and three saved continuations, preserving hidden originals without processing model calls", async () => {
  const lane = await laneWith({ process: CRITERIA });
  const first = await lane.attempt({ instruction: INSTRUCTION, script: [readLoans(), complete("Listed the matching loans.")] });
  expect(first.answer.attempt.status).toBe("achieved");
  expect(first.answer.result?.rows?.previewRows).toEqual([{ title: "Atlas of Rivers", due: "2030-01-01" }, { title: "Birds of the Coast", due: "2030-01-02" }]);
  expect(first.answer.result?.rows?.columns).toEqual([{ id: "title", label: "title" }]);
  expect(first.answer.result?.rows?.previewRows.every((row) => Object.hasOwn(row, "due"))).toBe(true);
  const kept = await lane.kept(INSTRUCTION);
  expect(kept?.processing).toMatchObject({ version: 1, revision: 1, task: { process: CRITERIA } });
  expect(JSON.stringify(kept?.best?.steps)).toContain('"declaration":{"version":1');
  const attempts = [first];
  for (let replay = 0; replay < 3; replay += 1) {
    const next = await lane.attempt({ instruction: INSTRUCTION, script: [] });
    attempts.push(next);
    expect(next.answer.attempt.status).toBe("achieved");
    expect(next.answer.result?.rows?.previewRows).toEqual(first.answer.result?.rows?.previewRows);
    expect(next.answer.attempt.path).toBe("run_flow");
    expect(next.decisions).toHaveLength(0);
    expect(next.asked.some((request) => JSON.stringify(request.context.evidenceLoop?.evidence).includes('"toolId":"core.set_result_processing"'))).toBe(false);
  }
  expect(attempts[2]?.judgeCalls).toHaveLength(0);
  expect(attempts[3]?.judgeCalls).toHaveLength(0);
  const last = attempts.at(-1)!.answer;
  const rows = last.result!.rows!;
  const persisted = await lane.service.runDatasets.getRunDatasetPage({ projectId: lane.projectId, runId: rows.runId, datasetId: rows.datasetId }, { retained: "answer" });
  expect(persisted?.rows).toEqual(rows.previewRows);
  expect(persisted?.displayColumns?.map((column) => column.id)).toEqual(["title"]);
});

it("a genuinely new direct task with omitted declaration keeps repairing and cannot gain a success from its judge", async () => {
  const lane = await laneWith(undefined);
  const result = await lane.attempt({ instruction: INSTRUCTION, script: [readLoans(), complete("Listed.")] });
  expect(result.answer.attempt.status).toBe("stopped_by_person"); // Only this fixture's explicit Stop ends the intentionally unfinished script.
  expect(result.judgeCalls).toHaveLength(0);
  expect(result.answer.result?.rows).toBeUndefined();
  expect((await lane.kept(INSTRUCTION))?.processing?.task).toEqual({});
  expect(result.decisions.some((request) => JSON.stringify(request).includes("processing_declaration_missing") || JSON.stringify(request).includes("data-processing declaration is missing"))).toBe(true);
  const datasets = await lane.service.runDatasets.listRunDatasetsForVerification({ projectId: lane.projectId, runId: result.answer.attempt.runId! });
  expect(datasets.some((dataset) => dataset.datasetId.startsWith("step."))).toBe(false);
});

it("carries pending binding evidence through a new real session, repairs it from the same originals, and never re-reads the site", async () => {
  const lane = await laneWith({ process: { ...CRITERIA, where: [{ field: "Due date", atMost: "2030-01-02", as: "date" }] } });
  const first = await lane.attempt({ instruction: INSTRUCTION, script: [readLoans(), complete("Listed.")] });
  expect(first.answer.attempt.status).toBe("stopped_by_person");
  expect(first.answer.result?.rows).toBeUndefined();
  const before = (await lane.rows()).at(-1)!;
  expect(before.resultEvidence?.pages.flatMap((page) => page.rows)).toHaveLength(3);
  const oldSession = await lane.service.getRuntimeSession(lane.projectId, first.answer.attempt.runId!);
  const count = lane.target.library.calls.filter((call) => call.value.node === READ_LOANS).length;
  const resumed = await automationStudioAnswerFirstCarryOn(lane.service, lane.stores, { projectId: lane.projectId, attemptId: first.answer.attempt.attemptId, addUsd: 0.1 }, () => lane.attempt({ instruction: INSTRUCTION, script: [toolCall("bind", "core.set_result_processing", { process: CRITERIA, why: "The original retained schema names the due-date field due; keep the same requested bound and original records." }), complete("Listed from the retained records.")] }));
  if (!resumed.ok) throw new Error(resumed.refused);
  const second = await resumed.finished;
  expect(second.answer.attempt.status).toBe("achieved");
  expect(second.answer.attempt.attemptId).toBe(first.answer.attempt.attemptId);
  expect(second.answer.attempt.runId).not.toBe(first.answer.attempt.runId);
  expect(lane.target.library.calls.filter((call) => call.value.node === READ_LOANS)).toHaveLength(count);
  const after = (await lane.rows()).at(-1)!;
  expect(after.processingReferenceTimeMs).toBe(before.processingReferenceTimeMs);
  expect(after.processing?.revision).toBe(2);
  expect(after.resultEvidence?.pages.flatMap((page) => page.rows)).toEqual(before.resultEvidence?.pages.flatMap((page) => page.rows));
  const newSession = await lane.service.getRuntimeSession(lane.projectId, second.answer.attempt.runId!);
  expect(newSession?.startedAt).toBeGreaterThanOrEqual(oldSession!.startedAt!);
  expect(newSession?.metadata?.processingReferenceTimeMs).toBe(oldSession?.startedAt);
});
