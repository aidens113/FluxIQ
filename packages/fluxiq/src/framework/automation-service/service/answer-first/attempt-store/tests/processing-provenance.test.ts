import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { automationStudioTaskAttemptNoLoopsCaught } from "@fluxiq/contracts/automation";
import { AutomationStudioAnswerFirstAttemptStore, AutomationStudioAnswerFirstAttemptsUnreadable, type AutomationStudioAnswerFirstAttemptRecord } from "../index.ts";
import { automationStudioAnswerFirstCarriedOpening } from "../../carry-on/index.ts";
import { automationStudioAnswerFirstRestoreResult, automationStudioAnswerFirstResultFeed } from "../../result-feed/index.ts";
import { automaticFeed, REFERENCE, SCHEMA } from "../../result-feed/tests/automatic-support.ts";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 }); });
const PROJECTS = { ensureProjectStructure: async () => undefined } as unknown as ConstructorParameters<typeof AutomationStudioAnswerFirstAttemptStore>[2];
const record = (): AutomationStudioAnswerFirstAttemptRecord => ({ attempt: { taskId: "task", attemptId: "attempt", ordinal: 1, projectId: "project", flowId: "flow", runId: "run.first", path: "explore", status: "working", spend: { calls: 0, inputTokens: 0, outputTokens: 0, usd: 0, ms: 0 }, budget: { usd: 5 }, liveSteps: 1, loopsCaught: automationStudioTaskAttemptNoLoopsCaught(), startedAtMs: REFERENCE }, tried: { version: 1, tried: [], approaches: 0 } });
async function disk() {
  const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-processing-attempt-")); roots.push(root);
  const flows = { flowDirectory: () => root };
  const open = () => new AutomationStudioAnswerFirstAttemptStore({ root }, flows, PROJECTS);
  return { root, open, store: open() };
}

it("reopens pending data with the same full originals/reference, repairs its binding, and creates no fake ready preview", async () => {
  const p = automaticFeed({ where: [{ field: "promotionFlag", equals: "false" }], columns: ["title"] });
  const originals = [{ id: "a", title: "Organic", promoted: false, price: "$2" }, { id: "a", title: "Promoted", promoted: true, price: "$1" }];
  p.read("one", originals);
  expect(p.feed.readiness().state).toBe("missing-evidence");
  expect(p.feed.rows().datasetId).toBeUndefined();
  const io = await disk();
  await io.store.save("project", "flow", { ...record(), steps: p.steps, processing: p.processing, processingReferenceTimeMs: REFERENCE, resultEvidence: p.feed.evidence() });
  const before = (await io.open().get("project", "flow", "attempt"))!;
  expect(before.result?.rows).toBeUndefined();
  const carried = automationStudioAnswerFirstCarriedOpening({ projectId: "project", flowId: "flow", taskId: "task", attemptId: "attempt", before, kept: undefined, acts: undefined, askedUsd: 5, budgetUsd: 5, opened: false });
  expect(carried.processingReferenceTimeMs).toBe(REFERENCE);
  const restored = automationStudioAnswerFirstRestoreResult({ evidence: carried.resultEvidence, steps: carried.steps, batches: [], source: (id) => p.sources.get(id) });
  if (!restored.ok) throw new Error(restored.reason);
  const feed = automationStudioAnswerFirstResultFeed({ instructionText: "List matching records.", readRowsKey: "read.extracted", processing: carried.processing, processingReferenceTimeMs: carried.processingReferenceTimeMs });
  feed.restored(restored.entries);
  expect(feed.collected()?.rows).toEqual(originals);
  expect(feed.readiness()).toMatchObject({ code: "answer_first.processing_binding_missing" });
  expect(feed.amendProcessing({ where: [{ field: "promoted", equals: "false" }], columns: ["title"] }, "The retained schema identifies promotionFlag as promoted on each original occurrence.")).toEqual({ ok: true, changed: true });
  expect(feed.readiness()).toEqual({ state: "ready" });
  expect(feed.rows().rows).toEqual([originals[0]]);
  expect(feed.collected()?.rows).toEqual(originals);
  expect(feed.processingDeclaration()?.revision).toBe(2);
});

it("preserves legacy absence but refuses invalid persisted clock/declaration/page metadata", async () => {
  const io = await disk();
  await io.store.save("project", "flow", record());
  expect((await io.open().get("project", "flow", "attempt"))?.processingReferenceTimeMs).toBeUndefined();
  for (const invalid of [-1, Number.NaN, Number.POSITIVE_INFINITY]) await expect(io.store.save("project", "flow", { ...record(), processingReferenceTimeMs: invalid })).rejects.toThrow("Invalid processing reference");
  await io.store.save("project", "flow", { ...record(), processingReferenceTimeMs: REFERENCE });
  const file = path.join(io.root, "answer-attempts.json");
  const stored = JSON.parse(await readFile(file, "utf8"));
  stored.attempts[0].processingReferenceTimeMs = null;
  await writeFile(file, JSON.stringify(stored));
  await expect(io.open().list("project", "flow")).rejects.toBeInstanceOf(AutomationStudioAnswerFirstAttemptsUnreadable);
});

it("keeps one latest evidence snapshot per attempt and measures a realistic 120-record fixture", async () => {
  const p = automaticFeed({ where: [{ field: "promotionFlag", equals: "false" }], columns: ["title", "price"] });
  const schema = { ...SCHEMA, fields: [...SCHEMA.fields, { id: "branch", label: "Branch", valueType: "string" as const }] };
  for (let page = 0; page < 3; page += 1) p.read(`page-${page}`, Array.from({ length: 40 }, (_, row) => ({ id: `${page}-${row}`, title: `Reference volume ${page * 40 + row}`, price: `$${(row + 1) * 2}.00`, promoted: row % 5 === 0, date: "2030-01-09", branch: `Branch ${row % 4}` })), schema, `page=${page + 1}`);
  const io = await disk();
  const evidence = p.feed.evidence();
  const snapshot = { ...record(), steps: p.steps, processing: p.processing, processingReferenceTimeMs: REFERENCE, resultEvidence: evidence };
  for (let checkpoint = 0; checkpoint < 3; checkpoint += 1) await io.store.save("project", "flow", snapshot);
  const kept = await io.open().list("project", "flow");
  expect(kept).toHaveLength(1);
  expect(kept[0]?.resultEvidence?.pages).toHaveLength(3);
  const rows = evidence.pages.flatMap((page) => page.rows);
  expect(rows).toHaveLength(120);
  console.info(`[processing fixture] records=${rows.length} pages=${evidence.pages.length} rawRowsBytes=${Buffer.byteLength(JSON.stringify(rows))} evidenceBytes=${Buffer.byteLength(JSON.stringify(evidence))} recordBytes=${Buffer.byteLength(JSON.stringify(snapshot))} checkpointCopies=${kept.length}`);
});
