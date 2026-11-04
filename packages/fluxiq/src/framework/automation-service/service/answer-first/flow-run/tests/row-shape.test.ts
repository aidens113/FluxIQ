// @fluxiq-test-group real-sql
// The risk the second attempt turns on (t861's report): one row reaches the act record in three
// shapes. A by-hand read holds it with what the read minted and every column it showed; the
// engine's For Each hands it on after a record output has kept only its own columns. If those do
// not meet, the row is pressed again, and a press cannot be taken back.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioAttemptActRecord, automationStudioAttemptActGate } from "../../../../../../runtime/answer-first/act-record/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../../../../runtime/llm/index.ts";
import { automationStudioAnswerFirstFlowRun } from "../index.ts";
import { flowRunFixture, libraryTarget, LOANS_OUTPUT, READ_BY_OUTPUT, RENEW_BY_OUTPUT, renewEveryLoan, savedStep, shownRows, withOutputDoor, type LibraryTarget } from "../../tests/fake-library-engine.ts";
import { READ_LOANS, RENEW_LOAN } from "../../tests/fake-library.ts";

vi.setConfig({ testTimeout: 60_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const TITLE_ONLY: JsonObject = { ...LOANS_OUTPUT, schema: { schemaVersion: "0.1", fields: [{ id: "title", label: "Title", valueType: "string" }] } };

/** The attempt's first row, done by hand through the real gate: its read as a read holds it, then a press on that row. */
async function renewedByHand(record: AutomationStudioAttemptActRecord, target: LibraryTarget, title: string, how: { item?: boolean; actedOn?: boolean; press?: string }): Promise<void> {
  const press = how.press ?? RENEW_LOAN;
  const gate = automationStudioAttemptActGate({
    record, readRowsKey: "read.extracted",
    executeTool: async (call: { callId: string; toolId: string; value: JsonObject }): Promise<AutomationStudioLlmEvidenceToolExecutionResult> => {
      if (call.value.node === READ_LOANS) return { kind: "llm_evidence_tool_execution", evidence: { read: { extracted: shownRows(target) } }, effectApplied: false, draft: { actionId: READ_LOANS, input: call.value, effect: "observe", proposes: true } };
      target.library.renewals[title] = (target.library.renewals[title] ?? 0) + 1;
      target.presses.push({ node: press, subject: title });
      return { kind: "llm_evidence_tool_execution", evidence: { ok: true, pageChanged: true, ...(how.actedOn ? { actedOn: `Pressed Renew on item 1/3: ${title}` } : {}) }, effectApplied: true, draft: { actionId: press, input: call.value, effect: "mutate", proposes: true } };
    }
  });
  await gate({ callId: "by-hand.read", toolId: "core.run_node", value: { node: READ_LOANS, parameters: {} } });
  const row = shownRows(target).find((each) => each.title === title)!;
  await gate({ callId: "by-hand.press", toolId: "core.run_node", value: { node: press, parameters: { control: "Renew" }, consequences: ["modify_existing"], ...(how.item ? { item: row } : {}) } });
}

const presses = (target: LibraryTarget) => target.presses.map((press) => press.subject).sort();

describe("a repeat over a read, on the engine, settling into the attempt's record", () => {
  it("reaches settle with the For Each's row: each row pressed once, and held at the run's stage", async () => {
    const fixture = await flowRunFixture({}, cleanups);
    const outcome = await automationStudioAnswerFirstFlowRun(fixture.ports, { steps: renewEveryLoan(), stepsDigest: "digest" });
    expect(outcome).toMatchObject({ kind: "ran", reachedEnd: true });
    expect(fixture.target.presses.map((press) => press.item)).toEqual([
      { title: "Atlas of Rivers", due: "2030-01-01" }, { title: "Birds of the Coast", due: "2030-01-02" }, { title: "Clockmaking", due: "2030-01-03" }
    ]);
    const acts = fixture.record.data().acts;
    expect(acts).toHaveLength(3);
    expect(acts.every((act) => act.state === "landed" && act.stage === "run" && act.rows.length > 0)).toBe(true);
  });

  it("a run of the same Flow again on the same record presses nothing", async () => {
    const fixture = await flowRunFixture({}, cleanups);
    await automationStudioAnswerFirstFlowRun(fixture.ports, { steps: renewEveryLoan(), stepsDigest: "digest" });
    const again = await automationStudioAnswerFirstFlowRun(fixture.ports, { steps: renewEveryLoan(), stepsDigest: "digest" });
    expect(again).toMatchObject({ kind: "ran", reachedEnd: true, steps: [{ position: 1, ran: "passed" }, { position: 2, ran: "skipped" }] });
    expect(fixture.target.presses).toHaveLength(3);
  });

  it("a row done by hand with its read's row in hand is not pressed again: the run presses only the others, once each", async () => {
    const target = libraryTarget();
    const record = new AutomationStudioAttemptActRecord();
    await renewedByHand(record, target, "Atlas of Rivers", { item: true });
    const fixture = await flowRunFixture({ target, record }, cleanups);
    expect(await automationStudioAnswerFirstFlowRun(fixture.ports, { steps: renewEveryLoan(), stepsDigest: "digest" })).toMatchObject({ kind: "ran", reachedEnd: true });
    expect(presses(target)).toEqual(["Atlas of Rivers", "Birds of the Coast", "Clockmaking"]);
    expect(target.library.renewals).toEqual({ "Atlas of Rivers": 1, "Birds of the Coast": 1, Clockmaking: 1 });
  });

  it("a row done by hand and known only by the answer's sentence is not pressed again either", async () => {
    const target = libraryTarget();
    const record = new AutomationStudioAttemptActRecord();
    await renewedByHand(record, target, "Birds of the Coast", { actedOn: true });
    const fixture = await flowRunFixture({ target, record }, cleanups);
    expect(await automationStudioAnswerFirstFlowRun(fixture.ports, { steps: renewEveryLoan(), stepsDigest: "digest" })).toMatchObject({ kind: "ran", reachedEnd: true });
    expect(target.library.renewals).toEqual({ "Atlas of Rivers": 1, "Birds of the Coast": 1, Clockmaking: 1 });
  });

  it("a record output that keeps fewer columns still meets the row the read held by hand", async () => {
    const target = libraryTarget();
    const record = new AutomationStudioAttemptActRecord();
    await renewedByHand(record, target, "Clockmaking", { item: true });
    const fixture = await flowRunFixture({ target, record }, cleanups);
    const steps = [
      savedStep(1, READ_LOANS, { recordOutput: TITLE_ONLY }),
      savedStep(2, RENEW_LOAN, { control: "Renew" }, { consequences: ["modify_existing"], routing: { kind: "repeat", through: "saved.2", over: "saved.1" } })
    ];
    expect(await automationStudioAnswerFirstFlowRun(fixture.ports, { steps, stepsDigest: "digest" })).toMatchObject({ kind: "ran", reachedEnd: true });
    expect(target.library.renewals).toEqual({ "Atlas of Rivers": 1, "Birds of the Coast": 1, Clockmaking: 1 });
  });

  it("the same, through the door a web step really uses: the node answers and its press goes out as an output", async () => {
    const target = libraryTarget();
    const record = new AutomationStudioAttemptActRecord();
    await renewedByHand(record, target, "Atlas of Rivers", { item: true, press: RENEW_BY_OUTPUT });
    const fixture = await flowRunFixture({ target, record, engine: withOutputDoor(target) }, cleanups);
    const steps = [
      savedStep(1, READ_BY_OUTPUT, { recordOutput: { ...LOANS_OUTPUT, recordsPath: "rows" } }),
      savedStep(2, RENEW_BY_OUTPUT, { control: "Renew" }, { consequences: ["modify_existing"], routing: { kind: "repeat", through: "saved.2", over: "saved.1" } })
    ];
    expect(await automationStudioAnswerFirstFlowRun(fixture.ports, { steps, stepsDigest: "digest" })).toMatchObject({ kind: "ran", reachedEnd: true });
    expect(target.library.renewals).toEqual({ "Atlas of Rivers": 1, "Birds of the Coast": 1, Clockmaking: 1 });
    expect(fixture.counts.liveSteps).toBe(3);
  });
});
