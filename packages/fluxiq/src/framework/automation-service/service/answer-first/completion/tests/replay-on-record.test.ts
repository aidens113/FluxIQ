// A replay of a saved Flow is accepted on its own record with no judge call, and judged whenever it
// deviates (task speed S9, `../replay-stands.ts`). Every deviation the rule names is pinned on its own,
// and so is what the completion check does with each answer: no judge call on record, one judge call
// otherwise, and a FluxNode's `judge: always` always asking.

import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_ANSWER_FIRST_ON_RECORD_WORDS, AUTOMATION_STUDIO_ANSWER_FIRST_REPLAY_DEVIATIONS, automationStudioAnswerFirstCompletionCheck, automationStudioAnswerFirstReplayStands, type AutomationStudioAnswerFirstReplayDeviation, type AutomationStudioAnswerFirstReplayRecord } from "../index.ts";

const COLUMNS = ["title", "price"];
const SHAPE = { columns: COLUMNS, empty: false };

/** A proven, confirmed Flow that ran whole: three steps passed, an absent prompt passed over, an already-done act skipped. */
function replay(change: Partial<AutomationStudioAnswerFirstReplayRecord> = {}): AutomationStudioAnswerFirstReplayRecord {
  return {
    saved: { label: "confirmed", provenWhole: true, shape: SHAPE },
    reachedEnd: true,
    steps: [
      { position: 1, ran: "passed" },
      { position: 2, ran: "skipped", skipped: "absent" },
      { position: 3, ran: "passed" },
      { position: 4, ran: "skipped", skipped: "already_done" },
      { position: 5, ran: "passed" }
    ],
    repaired: false,
    ...change
  };
}

const step = (change: Partial<AutomationStudioAnswerFirstReplayRecord["steps"][number]>) => replay({ steps: [{ position: 1, ran: "passed" }, { position: 2, ran: "passed", ...change }] });

describe("whether a replay stands on its own record", () => {
  it("stands when every step ran as saved and the rows are in the accepted shape", () => {
    expect(automationStudioAnswerFirstReplayStands(replay(), { shape: SHAPE })).toEqual({ stands: true });
    expect(automationStudioAnswerFirstReplayStands(replay(), { shape: { columns: ["price", "title"], empty: false }, judge: "auto" })).toEqual({ stands: true });
    // An act-only task: no rows then, no rows now.
    expect(automationStudioAnswerFirstReplayStands(replay({ saved: { label: "confirmed", provenWhole: true, shape: { columns: [], empty: true } } }), { shape: { columns: [], empty: true } })).toEqual({ stands: true });
  });

  it("names each deviation that sends it to the judge", () => {
    const cases: Array<[AutomationStudioAnswerFirstReplayDeviation, Parameters<typeof automationStudioAnswerFirstReplayStands>]> = [
      ["judge_always", [replay(), { shape: SHAPE, judge: "always" }]],
      ["asked_again", [replay(), { shape: SHAPE, askedAgain: true }]],
      ["flow_not_proven", [replay({ saved: { label: "confirmed", provenWhole: false, shape: SHAPE } }), { shape: SHAPE }]],
      ["flow_not_confirmed", [replay({ saved: { label: "unverified", provenWhole: true, shape: SHAPE } }), { shape: SHAPE }]],
      ["run_not_whole", [replay({ reachedEnd: false }), { shape: SHAPE }]],
      ["repaired", [replay({ repaired: true }), { shape: SHAPE }]],
      ["step_failed", [step({ ran: "failed" }), { shape: SHAPE }]],
      ["step_routed", [step({ ran: "skipped", skipped: "routed_elsewhere" }), { shape: SHAPE }]],
      ["act_not_done", [step({ ran: "skipped", skipped: "absent_not_done" }), { shape: SHAPE }]],
      ["check_cleared", [step({ personCleared: true }), { shape: SHAPE }]],
      ["step_retried", [step({ retries: 1 }), { shape: SHAPE }]],
      ["shape_unknown", [replay({ saved: { label: "confirmed", provenWhole: true } }), { shape: SHAPE }]],
      ["shape_differs", [replay(), { shape: { columns: ["title"], empty: false } }]]
    ];
    expect(cases.map(([deviation]) => deviation)).toEqual([...AUTOMATION_STUDIO_ANSWER_FIRST_REPLAY_DEVIATIONS]);
    for (const [deviation, args] of cases) expect(automationStudioAnswerFirstReplayStands(...args), deviation).toEqual({ stands: false, deviation });
  });

  it("judges a replay that read nothing where the accepted run read rows, and the reverse", () => {
    expect(automationStudioAnswerFirstReplayStands(replay(), { shape: { columns: COLUMNS, empty: true } })).toEqual({ stands: false, deviation: "shape_differs" });
    expect(automationStudioAnswerFirstReplayStands(replay({ saved: { label: "confirmed", provenWhole: true, shape: { columns: COLUMNS, empty: true } } }), { shape: SHAPE })).toEqual({ stands: false, deviation: "shape_differs" });
  });

  it("judges a step skipped with no closed reason, and a run with no steps", () => {
    expect(automationStudioAnswerFirstReplayStands(step({ ran: "skipped" }), { shape: SHAPE })).toEqual({ stands: false, deviation: "step_routed" });
    expect(automationStudioAnswerFirstReplayStands(replay({ steps: [] }), { shape: SHAPE })).toEqual({ stands: false, deviation: "step_failed" });
    expect(automationStudioAnswerFirstReplayStands(step({ ran: "not_reached" }), { shape: SHAPE })).toEqual({ stands: false, deviation: "step_failed" });
  });
});

describe("a completion that closes a replay", () => {
  const purse: Parameters<typeof automationStudioAnswerFirstCompletionCheck>[0]["purse"] = { keepBackForJudging: () => undefined };

  function made(record: AutomationStudioAnswerFirstReplayRecord | undefined, confirm?: Parameters<typeof automationStudioAnswerFirstCompletionCheck>[0]["confirm"]) {
    let judged = 0;
    const check = automationStudioAnswerFirstCompletionCheck({
      instructions: "Save every dining table under $200 and list them with title and price",
      rows: async () => ({ datasetId: "dataset.1", totalRows: 2, truncated: false, columns: COLUMNS.map((id) => ({ id, label: id })), rows: [{ title: "Oak", price: 120 }, { title: "Pine", price: 90 }] }),
      acts: () => [],
      readsRan: () => true,
      endView: async () => undefined,
      witnesses: () => ({}),
      judge: async () => {
        judged += 1;
        return { verdict: "yes", reason: "It is the list.", checkedWhat: "the list" };
      },
      ...(confirm ? { confirm } : {}),
      purse,
      say: () => undefined,
      replay: () => record
    });
    return { check, judged: () => judged };
  }

  it("accepts a replay that ran as saved with no judge call, as one check of its record", async () => {
    const { check, judged } = made(replay());
    expect(await check.check({ summary: "The saved Flow ran from its start to its end." })).toEqual({ ok: true });
    expect(judged()).toBe(0);
    // A confirmed result needs a check behind it (`task_result.label_needs_a_check`): the record is that check.
    expect(check.state).toMatchObject({ achieved: true, onRecord: true, timesChecked: 1 });
    expect(check.state.checkedWhat).toBe(AUTOMATION_STUDIO_ANSWER_FIRST_ON_RECORD_WORDS);
  });

  it("asks the judge once for a replay that deviated, and says why", async () => {
    const { check, judged } = made(step({ personCleared: true }));
    expect(await check.check({ summary: "The saved Flow ran from its start to its end." })).toEqual({ ok: true });
    expect(judged()).toBe(1);
    expect(check.state).toMatchObject({ achieved: true, deviation: "check_cleared", timesChecked: 1 });
    expect(check.state.onRecord).toBeUndefined();
  });

  it("asks the judge for every completion that is not a replay's", async () => {
    const { check, judged } = made(undefined);
    await check.check({ summary: "Done." });
    expect(judged()).toBe(1);
    expect(check.state.deviation).toBeUndefined();
  });

  it("always asks the judge for a caller whose judge is `always`, even after its own check passed", async () => {
    const { check, judged } = made(replay(), { judge: "always", check: () => true });
    await check.check({ summary: "The saved Flow ran from its start to its end." });
    expect(judged()).toBe(1);
    expect(check.state).toMatchObject({ achieved: true, confirmedBy: "judge", deviation: "judge_always", timesChecked: 2 });
  });
});
