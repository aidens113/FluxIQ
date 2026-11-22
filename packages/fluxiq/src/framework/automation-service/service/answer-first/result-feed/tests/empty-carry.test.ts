import { expect, it } from "vitest";
import type { AutomationStudioRecordSchema } from "@fluxiq/contracts/automation";
import { automationStudioAnswerFirstRestoreResult, automationStudioAnswerFirstResultFeed } from "../index.ts";
import { automaticFeed, REFERENCE } from "./automatic-support.ts";

it("restores a truthful known-empty minRows:0 source while an absent source/schema stays unready", () => {
  const p = automaticFeed({ minRows: 0, columns: ["title"] });
  p.read("empty", []);
  const input = { evidence: p.feed.evidence(), steps: p.steps, batches: [], source: (id: string) => p.sources.get(id) };
  const restored = automationStudioAnswerFirstRestoreResult(input);
  if (!restored.ok) throw new Error(restored.reason);
  const feed = automationStudioAnswerFirstResultFeed({ instructionText: "List the matching records.", readRowsKey: "read.extracted", processing: p.processing, processingReferenceTimeMs: REFERENCE });
  feed.restored(restored.entries);
  expect(feed.readiness()).toEqual({ state: "ready" });
  expect(feed.rows()).toMatchObject({ totalRows: 0, rows: [], schema: { primaryKey: ["id"] } });
  expect(automationStudioAnswerFirstRestoreResult({ ...input, source: () => undefined }).ok).toBe(false);
  expect(automationStudioAnswerFirstRestoreResult({ ...input, source: () => ({ rows: [], schema: undefined }) }).ok).toBe(false);
});

it("refuses a corrupt retained schema as source feedback instead of accepting it or throwing out of the repair path", () => {
  const p = automaticFeed({ minRows: 0, columns: ["title"] });
  p.read("empty", []);
  const restored = automationStudioAnswerFirstRestoreResult({ evidence: p.feed.evidence(), steps: p.steps, batches: [], source: () => ({ schema: { schemaVersion: "0.1", fields: null } as unknown as AutomationStudioRecordSchema, rows: [] }) });
  expect(restored).toMatchObject({ ok: false, reason: expect.stringContaining("schema") });
});
