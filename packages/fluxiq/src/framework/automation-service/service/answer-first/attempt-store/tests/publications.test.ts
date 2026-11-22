import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { automationStudioTaskAttemptNoLoopsCaught } from "@fluxiq/contracts/automation";
import { automationStudioAnswerFirstResult } from "../../../../../../runtime/answer-first/result/index.ts";
import { AutomationStudioAnswerFirstAttemptStore, type AutomationStudioAnswerFirstAttemptRecord } from "../index.ts";
import { automationStudioAnswerFirstCarriedOpening } from "../../carry-on/index.ts";
import { automationStudioAnswerFirstResultFeed } from "../../result-feed/index.ts";
import { automaticFeed, REFERENCE } from "../../result-feed/tests/automatic-support.ts";
import { reread } from "../../result-feed/tests/source-validation-support.ts";
import { automationStudioAnswerFirstTrailsOf } from "../../trail/index.ts";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 }); });
const PROJECTS = { ensureProjectStructure: async () => undefined } as unknown as ConstructorParameters<typeof AutomationStudioAnswerFirstAttemptStore>[2];

async function disk() {
  const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-publication-state-"));
  roots.push(root);
  const open = () => new AutomationStudioAnswerFirstAttemptStore({ root }, { flowDirectory: () => root }, PROJECTS);
  return { open, file: path.join(root, "answer-attempts.json") };
}

function record(): AutomationStudioAnswerFirstAttemptRecord {
  const p = automaticFeed({ columns: ["title"] });
  p.read("source", [{ id: "a", title: "Actual", date: "1 day ago" }]);
  return {
    attempt: { taskId: "task", attemptId: "attempt", ordinal: 1, projectId: "project", flowId: "flow", runId: "run.first", path: "explore", status: "working", spend: { calls: 0, inputTokens: 0, outputTokens: 0, usd: 0, ms: 0 }, budget: { usd: 5 }, liveSteps: 1, loopsCaught: automationStudioTaskAttemptNoLoopsCaught(), startedAtMs: REFERENCE },
    result: automationStudioAnswerFirstResult({ attemptId: "attempt", label: "unverified", timesChecked: 0, acts: [], rows: { runId: "run.first", datasetId: "step.source.v1", totalRows: 1, truncated: false, columns: [{ id: "title", label: "Title" }], previewRows: [{ title: "Actual" }] } }),
    tried: { version: 1, tried: [], approaches: 0 }, steps: p.steps, processing: p.processing, processingReferenceTimeMs: REFERENCE, resultEvidence: p.feed.evidence(), publications: { version: 1, knownDatasetIds: ["step.source.v1", "step.old.v1"], complete: true }
  };
}

it("roundtrips only exact private tracked IDs through reopen and carry, with legacy absence preserved", async () => {
  const io = await disk();
  const snapshot = record();
  await io.open().save("project", "flow", snapshot);
  const reopened = (await io.open().get("project", "flow", "attempt"))!;
  expect(reopened).toEqual(snapshot);
  const carried = automationStudioAnswerFirstCarriedOpening({ projectId: "project", flowId: "flow", taskId: "task", attemptId: "attempt", before: reopened, kept: undefined, acts: undefined, askedUsd: 5, budgetUsd: 5, opened: false });
  expect(carried.publications).toEqual(snapshot.publications);
  const { publications: _modern, ...legacy } = snapshot;
  await io.open().save("project", "flow", legacy);
  expect((await io.open().get("project", "flow", "attempt"))?.publications).toBeUndefined();
});

it.each([null, [], {}, { version: 2, knownDatasetIds: [], complete: true }, { version: 1, knownDatasetIds: ["step.x", "step.x"], complete: true }, { version: 1, knownDatasetIds: [null], complete: true }, { version: 1, knownDatasetIds: [" "], complete: true }, { version: 1, knownDatasetIds: [], complete: "yes" }, { version: 1, knownDatasetIds: [], complete: true, guessed: true }])("preserves the actual task/result/clock/source bundle when optional publication metadata is malformed: %j", async (publications) => {
  const io = await disk();
  const snapshot = record();
  await io.open().save("project", "flow", snapshot);
  const envelope = JSON.parse(await readFile(io.file, "utf8"));
  envelope.data.attempts[0].publications = publications;
  await writeFile(io.file, JSON.stringify(envelope));
  const reopened = (await io.open().get("project", "flow", "attempt"))!;
  expect(reopened).toEqual({ ...snapshot, publications: { version: 1, knownDatasetIds: [], complete: false } });
  await io.open().save("project", "flow", reopened);
  expect((await io.open().get("project", "flow", "attempt"))?.publications?.complete).toBe(false);
});

it("keeps unknown publication tracking repairable and explicit while retaining source data, without a read erasing it", () => {
  const snapshot = record();
  const feed = automationStudioAnswerFirstResultFeed({ instructionText: "List matching records.", readRowsKey: "read.extracted", processing: snapshot.processing, processingReferenceTimeMs: snapshot.processingReferenceTimeMs, publicationTrackingComplete: false });
  const page = snapshot.resultEvidence!.pages[0]!;
  const step = snapshot.steps![0]!;
  const source = automaticFeed({ columns: ["title"] });
  source.read("source", [...page.rows]);
  const schema = source.feed.collected()!.schema;
  feed.restored([{ step, version: page.version, schema, datasetId: page.datasetId!, read: { source: page.source, version: { conditions: page.conditions, fields: page.fields, ...(page.listKey === undefined ? {} : { listKey: page.listKey }) }, kept: page.rows, invalidCount: 0, place: page.place } }]);
  expect(feed.readiness()).toMatchObject({ code: "answer_first.publication_tracking_missing" });
  expect(feed.rows().datasetId).toBeUndefined();
  expect(feed.evidence().pages.flatMap((value) => value.rows)).toEqual(page.rows);
  expect(feed.processingDeclaration()).toEqual(snapshot.processing);
  expect(feed.slot()).toContain("pending-publication metadata is unavailable");
  expect(feed.amendProcessing({ columns: ["title"] }, "Keep the same data declaration.")).toMatchObject({ ok: true });
  reread(feed, step, "fresh", [...page.rows], schema, "page=1");
  expect(feed.readiness()).toMatchObject({ code: "answer_first.publication_tracking_missing" });
});

it("keeps publication tracking, actual task evidence and the independent judge issue through metadata saves and reopen", async () => {
  const io = await disk();
  const store = io.open();
  const snapshot = record();
  const journal = automationStudioAnswerFirstTrailsOf({});
  const trail = journal.of("attempt", { carriedOn: false, askedAgain: false });
  trail.push({ did: "library.read", callId: "actual.read", framework: { effectApplied: false }, judgeEvidence: { version: 1, role: "observation", evidence: { observed: "Actual safe retained records" }, missing: [], withheld: false } });
  const checkpoint = journal.checkpoint(trail, {}, { judgeEvidenceVersion: 1, deniedEvidenceKeys: [] })!;
  await store.save("project", "flow", { ...snapshot, judgeEvidence: checkpoint });
  const conflicting = { ...structuredClone(checkpoint), trail: [{ ...checkpoint.trail[0]!, framework: { effectApplied: true } }] };
  await expect(store.saveJudgeEvidence("project", "flow", "attempt", conflicting)).rejects.toThrow("revision conflict");
  const marked = (await io.open().get("project", "flow", "attempt"))!;
  expect(marked).toMatchObject({ ...snapshot, judgeEvidence: checkpoint, judgeEvidenceIssue: { code: "checkpoint_conflict" } });
  trail.push({ did: "library.look", callId: "actual.look", framework: { effectApplied: false }, judgeEvidence: { version: 1, role: "observation", evidence: { observed: "Another actual harmless observation" }, missing: [], withheld: false } });
  const newer = journal.checkpoint(trail, {}, { judgeEvidenceVersion: 1, deniedEvidenceKeys: [] })!;
  expect(newer.revision).toBeGreaterThan(checkpoint.revision);
  await store.saveJudgeEvidence("project", "flow", "attempt", newer);
  await store.saveJudgeEvidence("project", "flow", "attempt", checkpoint);
  const afterStaleSave = (await io.open().get("project", "flow", "attempt"))!;
  expect(afterStaleSave).toMatchObject({ ...snapshot, judgeEvidence: newer, judgeEvidenceIssue: { code: "checkpoint_conflict" } });
  expect(afterStaleSave.publications).toEqual(snapshot.publications);
  const retired = { version: 1 as const, knownDatasetIds: [], complete: true };
  await store.save("project", "flow", { ...afterStaleSave, publications: retired });
  const reopened = (await io.open().get("project", "flow", "attempt"))!;
  expect(reopened).toMatchObject({ ...snapshot, publications: retired, judgeEvidence: newer, judgeEvidenceIssue: { code: "checkpoint_conflict" } });
  const carried = automationStudioAnswerFirstCarriedOpening({ projectId: "project", flowId: "flow", taskId: "task", attemptId: "attempt", before: reopened, kept: undefined, acts: undefined, askedUsd: 5, budgetUsd: 5, opened: false });
  expect(carried.publications).toEqual(retired);
  expect(carried.judgeEvidence).toEqual(newer);
  expect(carried.judgeEvidenceIssue).toMatchObject({ code: "checkpoint_conflict" });
  expect(carried.resultEvidence).toEqual(snapshot.resultEvidence);
  expect(carried.processingReferenceTimeMs).toBe(snapshot.processingReferenceTimeMs);
});
