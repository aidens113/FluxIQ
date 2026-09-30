// What the decisions of three recorded live builds were shown, before the
// decision history and after it.
//
// `./recorded-runs.ts` replays each build's `[FluxIQ build-trace]` record
// through the real evidence loop with scripted callbacks. This file holds the
// replay to the record first -- the same decisions, the same calls in the same
// order under the same ids, the same result codes and the same dry-run
// positions -- because a window read off a replay that drifted from the run
// would describe some other build. Where Core has since changed deliberately
// how it answers one of those decisions, the run names that decision and the
// line it now traces (`now` in `./recorded-runs.ts`), and the replay is held to
// that line instead; `DIVERGES` pins which decisions those are.
//
// Then, for the decisions the debugs of these runs could not see into, it sets
// what the model was shown on the old code beside what it is shown now:
//
//   - **Before** is two things. The numbers the old code produced on these same
//     replays, quoted from t189-wA's report (`OLD`, below): the old window, whose
//     only record of earlier decisions was a list of tool calls, so a Core note
//     that scrolled out left no trace. And the window as the current code
//     chooses it, every shown entry except `core.evidence_history`, which is
//     what superseding alone changed.
//   - **After** is everything the decision is shown now: that window, plus the
//     history of every decision and what Core answered each.
//
// The assertions are what the history and superseding were built to do, on
// the three runs that showed they were needed.
import { describe, expect, it } from "vitest";
import { replayRecordedRun, type RecordedEvidenceEntry, type RecordedRunName, type RecordedRunReplay } from "./recorded-runs.ts";

const HISTORY = "core.evidence_history";
const WINDOW_BYTES = 24_000;
const HISTORY_CAP = 4_000;

/**
 * The decisions each replay is expected to trace differently from its log:
 * every completion the check refused that the live build dry-ran anyway. Since
 * 2026-09-30 such a completion is still the build's live phase and is not
 * tested; the draft is replayed from its first step only once the check
 * accepts it (`../../evidence-loop/completion-attempt.ts`).
 */
const DIVERGES: Readonly<Record<RecordedRunName, readonly number[]>> = {
  "bigbox-run6": [22, 26],
  crossborder: [19],
  "everything-store-run4": [40, 44, 46]
};

/** How each replay ends: after its last logged call, or on the decision after its last logged one. */
const ENDING: Readonly<Record<RecordedRunName, string>> = {
  "bigbox-run6": "llm_evidence_loop.cancelled",
  crossborder: "llm_evidence_loop.cancelled",
  "everything-store-run4": "llm_evidence_loop.invalid_decision"
};

type Old = { entries: number; bytes: number; pages: number; notes: number; noteBytes: number; missing: number };

/**
 * The old code's windows on these replays, quoted from
 * `docs/working/language-driven-flow-loop-plan/reports/t189-wA-recorded-windows.md`
 * (default 5,800-byte pages and 2,000-byte detections). `notes` are the Core
 * notes in the window (`core.request_check`, `core.no_progress`,
 * `core.completion_check`, `core.dry_run`); `missing` the earlier notes it
 * had dropped with no trace, because the old history listed tool calls only.
 *
 *   - Run 6 decision 15: 10 entries, 23,892 bytes; 3 missing (request checks 6, 7, 8).
 *   - Run 6 decision 22: 18 entries, 23,919 bytes; seven `core.request_check`
 *     and six `core.no_progress` notes, 8,398 bytes of them, and 2 pages.
 *   - Run 6 decision 26: 12 of 21 notes gone. Decision 37: 16 gone, and dry
 *     run 1's page (`dryrun.1.4`, 5,861 bytes) and refusal still shown.
 *   - Run 6's first redirect in each answered run: `core.no_progress.8` (6-9)
 *     and `core.no_progress.16` (14-20).
 *   - Crossborder decision 14: both identical refusals, `.12` and `.13`, side
 *     by side, and nothing marking the second as a repeat.
 *   - Run 4 decision 47: the refusals from 40 and 44 and the request check
 *     from 8 dropped with no trace; dry run 1's stale refusal and page shown
 *     although dry runs 2-4 replayed clean. (They were clean only because the
 *     old gate waved steps 3 and 6 through; they refuse now.)
 */
const OLD: Readonly<Record<RecordedRunName, Readonly<Record<number, Old>>>> = {
  "bigbox-run6": {
    15: { entries: 10, bytes: 23_892, pages: 3, notes: 4, noteBytes: 2_619, missing: 3 },
    22: { entries: 18, bytes: 23_919, pages: 2, notes: 13, noteBytes: 8_398, missing: 5 },
    26: { entries: 13, bytes: 23_800, pages: 2, notes: 8, noteBytes: 7_434, missing: 12 },
    37: { entries: 10, bytes: 23_909, pages: 2, notes: 5, noteBytes: 6_089, missing: 16 }
  },
  crossborder: {
    13: { entries: 8, bytes: 19_586, pages: 3, notes: 2, noteBytes: 2_056, missing: 0 },
    14: { entries: 9, bytes: 21_131, pages: 3, notes: 3, noteBytes: 3_601, missing: 0 }
  },
  "everything-store-run4": {
    30: { entries: 9, bytes: 23_046, pages: 3, notes: 3, noteBytes: 3_270, missing: 0 },
    47: { entries: 9, bytes: 23_899, pages: 3, notes: 3, noteBytes: 4_305, missing: 3 }
  }
};

const CORE_NOTE = /^core\.(completion_check|dry_run|request_check|no_progress|amendment_check)$/;
const isNote = (entry: { toolId: string }): boolean => CORE_NOTE.test(entry.toolId);
/** A page: what a tool call or a dry-run step answered, not a Core note or a beside entry. */
const isPage = (entry: { toolId: string }): boolean => entry.toolId === "core.run_node" || entry.toolId === "core.dry_run.page" || !entry.toolId.startsWith("core.");
const bytes = (value: unknown): number => Buffer.byteLength(JSON.stringify(value), "utf8");

// ---------------------------------------------------------------------------
// Reading what a decision was shown.
// ---------------------------------------------------------------------------

type HistoryValue = { format: string; fields: string[]; rows: unknown[][]; redirects?: Record<string, number[]>; folded?: number };
type Row = { at: number[]; kind: string; callId?: string | null; code?: unknown; detail?: Record<string, unknown> | null; sameAs?: number | null };

function shownAt(replay: RecordedRunReplay, iteration: number): RecordedEvidenceEntry[] {
  const shown = replay.shown.find((entry) => entry.iteration === iteration);
  if (!shown) throw new Error(`${replay.name}: decision ${iteration} was never asked`);
  return shown.evidence;
}

function historyAt(replay: RecordedRunReplay, iteration: number): HistoryValue {
  const entry = shownAt(replay, iteration).find((item) => item.toolId === HISTORY);
  if (!entry) throw new Error(`${replay.name}: decision ${iteration} was shown no history`);
  return entry.value as unknown as HistoryValue;
}

/** The history's rows as objects. A folded range of plain calls is not one decision's row and is left out. */
function rowsOf(history: HistoryValue): Row[] {
  return history.rows.flatMap((cells) => {
    if (typeof cells[0] === "string") return [];
    const row: Record<string, unknown> = {};
    history.fields.forEach((field, index) => { row[field] = cells[index] ?? null; });
    return [{ ...row, at: Array.isArray(cells[0]) ? cells[0] as number[] : [cells[0] as number] } as Row];
  });
}

function note(replay: RecordedRunReplay, callId: string, atDecision: number): Record<string, unknown> {
  const entry = shownAt(replay, atDecision).find((item) => item.callId === callId);
  if (!entry) throw new Error(`${replay.name}: ${callId} was not shown to decision ${atDecision}`);
  return entry.value as Record<string, unknown>;
}

/** The iterations, before `iteration`, whose call or decision Core refused or answered from memory. */
function refusedBefore(replay: RecordedRunReplay, iteration: number): number[] {
  return [...new Set(replay.trace.filter((row) => row.iteration < iteration && (
    (row.decision === "tool_call" && (row.resultCode?.includes(".rejected.") || row.resultCode?.startsWith("llm_evidence_loop.already_") || row.resultCode === "llm_evidence_loop.not_offered"))
    || row.decision === "unusable"
    || (row.decision === "amend_draft" && ((row.amendmentsRefused?.length ?? 0) > 0 || row.resultCode === "llm_evidence_loop.draft_amendment_undone"))
  )).map((row) => row.iteration))];
}

type Measured = {
  run: RecordedRunName;
  at: number;
  "old entries": number; "old bytes": number; "old pages": number; "old notes": number; "old note B": number; "old lost": number;
  "window entries": number; "window bytes": number; "window pages": number; "window notes": number; "window note B": number;
  "history B": number; "history form": string;
  "after entries": number; "after bytes": number;
};

function measure(replay: RecordedRunReplay, iteration: number): Measured {
  const shown = shownAt(replay, iteration);
  const window = shown.filter((entry) => entry.toolId !== HISTORY);
  const notes = window.filter(isNote);
  const history = historyAt(replay, iteration);
  const old = OLD[replay.name][iteration]!;
  return {
    run: replay.name,
    at: iteration,
    "old entries": old.entries, "old bytes": old.bytes, "old pages": old.pages, "old notes": old.notes, "old note B": old.noteBytes, "old lost": old.missing,
    "window entries": window.length,
    "window bytes": window.reduce((total, entry) => total + bytes(entry), 0),
    "window pages": window.filter(isPage).length,
    "window notes": notes.length,
    "window note B": notes.reduce((total, entry) => total + bytes(entry), 0),
    "history B": bytes(history),
    "history form": `${history.format}${history.folded ? ` folded ${history.folded}` : ""}`,
    "after entries": shown.length,
    "after bytes": shown.reduce((total, entry) => total + bytes(entry), 0)
  };
}

const replays = new Map<RecordedRunName, Promise<RecordedRunReplay>>();
const replay = (name: RecordedRunName): Promise<RecordedRunReplay> => {
  if (!replays.has(name)) replays.set(name, replayRecordedRun(name));
  return replays.get(name)!;
};

const ordinal = (count: number): string => {
  const tens = count % 100;
  return `${count}${tens >= 11 && tens <= 13 ? "th" : count % 10 === 1 ? "st" : count % 10 === 2 ? "nd" : count % 10 === 3 ? "rd" : "th"}`;
};
const range = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, index) => from + index);

// ---------------------------------------------------------------------------
// (a) The replay is the recorded run.
// ---------------------------------------------------------------------------

describe("the replay is the recorded run", () => {
  it("bigbox-run6: past the last logged decision the replay runs to its scripted end", async () => {
    // On the old code this threw `Cannot measure malformed or unknown packed
    // draft shape` building decision 38's draft: a refused press is packed as
    // `did_not_work`, which `../../evidence-loop/draft-shown.ts` did not accept.
    // With that fixed the loop asks decision 38 and ends on its unreadable answer.
    const run = await replayRecordedRun("bigbox-run6", { pastLog: true });
    expect(Object.keys(run.diverges).map(Number)).toEqual(DIVERGES["bigbox-run6"]);
    expect(run.rebuilt).toEqual(run.expected);
    expect(run.result.ok ? undefined : run.result.code).toBe("llm_evidence_loop.invalid_decision");
    expect(run.shown.at(-1)?.iteration).toBe(38);
  });

  for (const name of Object.keys(OLD) as RecordedRunName[]) {
    it(`${name}: every decision, call, result code and dry-run call id as logged`, async () => {
      const run = await replay(name);
      expect(run.rebuilt).toEqual(run.expected);
      // The expected run is the log except where the run names a deliberate change.
      const changed = run.logged.flatMap((line, index) => line === run.expected[index] ? [] : [Number(/^D(\d+)/.exec(line)![1])]);
      expect(changed).toEqual(DIVERGES[name]);
      expect(Object.keys(run.diverges).map(Number)).toEqual(DIVERGES[name]);
      // The run ends where the log ends, on the scripted end and not on a guard.
      expect(run.result.ok).toBe(false);
      expect(run.result.ok ? undefined : run.result.code).toBe(ENDING[name]);
      // Every decision the log shows answered from memory was answered from memory.
      for (const iteration of run.answered) {
        expect(run.trace.find((row) => row.iteration === iteration && row.decision === "tool_call")?.resultCode, `decision ${iteration}`).toBe("llm_evidence_loop.already_answered");
      }
    });
  }
});

// ---------------------------------------------------------------------------
// (b) Before and after, at every chosen decision.
// ---------------------------------------------------------------------------

describe("every chosen decision, before and after", () => {
  it("prints the table", async () => {
    const table: Measured[] = [];
    for (const [name, decisions] of Object.entries(OLD) as [RecordedRunName, Readonly<Record<number, Old>>][]) {
      const run = await replay(name);
      for (const at of Object.keys(decisions)) table.push(measure(run, Number(at)));
    }
    console.table(table);
    console.log(`RECORDED-BEFORE-AFTER ${JSON.stringify(table)}`);
  });

  for (const [name, decisions] of Object.entries(OLD) as [RecordedRunName, Readonly<Record<number, Old>>][]) {
    for (const at of Object.keys(decisions)) {
      const iteration = Number(at);
      it(`${name} decision ${iteration}: inside the window, the history inside its cap, every refusal so far on a row`, async () => {
        const run = await replay(name);
        const shown = shownAt(run, iteration);
        expect(shown.reduce((sum, entry) => sum + bytes(entry), 0)).toBeLessThanOrEqual(WINDOW_BYTES + shown.length);
        const history = historyAt(run, iteration);
        if (history.format !== "decision_rows_least_v1") expect(bytes(history)).toBeLessThanOrEqual(HISTORY_CAP);
        // A folded range does not count: a refusal keeps a row of its own on every rung.
        const onRows = new Set(rowsOf(history).flatMap((row) => row.at));
        const lost = refusedBefore(run, iteration).filter((refused) => !onRows.has(refused));
        expect(lost, `refusals with no row at decision ${iteration}`).toEqual([]);
        expect(shown.some((entry) => entry.toolId === "core.flow_draft")).toBe(true);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// (c) What each run showed was needed.
// ---------------------------------------------------------------------------

describe("bigbox-run6: the answered repeats are caught and shown", () => {
  it("each run of answers from one result is one history row pointing at the call it repeats", async () => {
    const run = await replay("bigbox-run6");
    for (const at of [21, 37]) {
      const answered = rowsOf(historyAt(run, at)).filter((row) => row.kind === "answered");
      expect(answered.map((row) => ({ at: row.at, callId: row.callId, sameAs: row.sameAs })), `decision ${at}`).toEqual([
        { at: range(6, 9), callId: "snap3", sameAs: 5 },
        { at: range(14, 20), callId: "snap-store-list", sameAs: 13 }
      ]);
    }
  });

  it("the note after each repeat says how often, since when, and that nothing has run since", async () => {
    const run = await replay("bigbox-run6");
    const runs = [
      { answeredAt: 5, answeredBy: "snap3", lastAction: { callId: "open-store-picker", iteration: 4 }, asked: range(6, 9) },
      { answeredAt: 13, answeredBy: "snap-store-list", lastAction: { callId: "pick-millbrook", iteration: 12 }, asked: range(14, 20) }
    ];
    for (const { answeredAt, answeredBy, lastAction, asked } of runs) {
      for (const iteration of asked) {
        const value = note(run, `core.request_check.${iteration}`, iteration + 1);
        // The executed call counts as the first ask.
        const askedAt = range(answeredAt, iteration);
        expect(value, `core.request_check.${iteration}`).toMatchObject({
          answeredByCallId: answeredBy, timesAsked: askedAt.length, askedAt, answeredAt, lastActionBefore: lastAction
        });
        // An answer from memory takes no digest, so it never claims to have seen the page (t196).
        expect(value).not.toHaveProperty("pageUnchanged");
        expect(value.instruction).toContain(`It was answered at iteration ${answeredAt} and no action has run since.`);
        expect(value.instruction).toContain(`This is the ${ordinal(askedAt.length)} time you have asked it`);
      }
    }
  });

  it("the redirect arrives at the second answer from one result, earlier than before", async () => {
    const run = await replay("bigbox-run6");
    // The first no-progress note written in each answered run. Old code:
    // `core.no_progress.8` in 6-9 and `core.no_progress.16` in 14-20.
    const firstRedirect = (from: number, to: number): string | undefined =>
      run.coreEntries.filter((entry) => entry.toolId === "core.no_progress").map((entry) => entry.callId)
        .find((callId) => { const at = Number(callId.split(".").pop()); return at >= from && at <= to; });
    expect(firstRedirect(6, 9)).toBe("core.no_progress.7");
    expect(firstRedirect(14, 20)).toBe("core.no_progress.15");
    expect(historyAt(run, 21).redirects?.["llm_evidence_loop.no_progress"]).toEqual([7, 8, 9, 15, 16, 17, 18, 19, 20]);
  });
});

describe("bigbox-run6 decision 22: the superseded notes leave, and pages take their room", () => {
  it("one request check and one no-progress note, where there were seven and six", async () => {
    const run = await replay("bigbox-run6");
    const window = shownAt(run, 22).filter((entry) => entry.toolId !== HISTORY);
    expect(window.filter((entry) => entry.toolId === "core.request_check").map((entry) => entry.callId)).toEqual(["core.request_check.20"]);
    expect(window.filter((entry) => entry.toolId === "core.no_progress").map((entry) => entry.callId)).toEqual(["core.no_progress.20"]);
    expect(window.filter(isNote).reduce((total, entry) => total + bytes(entry), 0)).toBeLessThan(OLD["bigbox-run6"][22]!.noteBytes);
    // Old: `pick-millbrook` and `snap-store-list`. Now `open-store-picker-2` is back beside them.
    expect(window.filter(isPage).map((entry) => entry.callId)).toEqual(["open-store-picker-2", "pick-millbrook", "snap-store-list"]);
    expect(window.filter(isPage).length).toBeGreaterThan(OLD["bigbox-run6"][22]!.pages);
  });
});

describe("bigbox-run6 decision 37: every completion is on the record, and the stale dry run is gone", () => {
  it("completions 22 and 26 are distinct rows with their codes, untested because the check refused them; amendment 21 withdrew step 12", async () => {
    const run = await replay("bigbox-run6");
    const rows = rowsOf(historyAt(run, 37));
    const completions = rows.filter((row) => row.kind === "completion");
    expect(completions.map((row) => row.at)).toEqual([[22], [26]]);
    expect(completions[0]!.code).toEqual(expect.arrayContaining(["bootstrap.cannot_reach_start_location", "bootstrap.completion_profile_limit_exceeded"]));
    // The check refused both, so neither was tested: no dry run, and nothing
    // replayed from the first step in the middle of the build's live work.
    expect(completions.map((row) => row.detail?.dryRun)).toEqual([undefined, undefined]);
    expect(completions[1]!.code).toBe("bootstrap.instructed_act_missing");
    expect(rows.find((row) => row.kind === "amendment" && row.at[0] === 21)?.detail?.withdrewChanged).toEqual([12]);
    const ids = shownAt(run, 37).map((entry) => entry.callId);
    expect(ids).not.toContain("dryrun.1.4");
    expect(ids).not.toContain("core.dry_run.1");
    // The answered-repeat note and the redirect from 20 left once calls ran and
    // the build made progress again (before: still shown 17 decisions later,
    // 1,642 bytes); their trace is the history row and its redirects.
    expect(ids.filter((id) => id.startsWith("core.request_check.") || id.startsWith("core.no_progress."))).toEqual([]);
    expect(historyAt(run, 37).redirects?.["llm_evidence_loop.no_progress"]).toEqual(expect.arrayContaining([15, 20]));
  });
});

describe("crossborder decisions 13-14: the identical refusal is caught", () => {
  it("the second refusal is marked a repeat of the first, shown alone, and one history row", async () => {
    const run = await replay("crossborder");
    expect(note(run, "core.completion_check.12", 13)).not.toHaveProperty("sameAsIteration");
    const ids = shownAt(run, 14).map((entry) => entry.callId);
    expect(ids).toContain("core.completion_check.13");
    expect(ids).not.toContain("core.completion_check.12");
    expect(note(run, "core.completion_check.13", 14)).toMatchObject({ sameAsIteration: 12, timesSent: 2 });
    expect(rowsOf(historyAt(run, 14)).filter((row) => row.kind === "completion").map((row) => row.at)).toEqual([[12, 13]]);
  });
});

describe("everything-store-run4 decision 47: no refusal is lost, and the stale dry run is gone", () => {
  it("refusals 40, 44 and 46 are all on the record; dry run 1's refusal and page have left; the newest page is shown", async () => {
    const run = await replay("everything-store-run4");
    const completions = rowsOf(historyAt(run, 47)).filter((row) => row.kind === "completion");
    expect(completions.flatMap((row) => row.at)).toEqual(expect.arrayContaining([40, 44, 46]));
    // Only 29's check passed, so only 29 was tested; 40, 44 and 46 were refused
    // by the check and, being live work still, not replayed from the first step.
    expect(completions.find((row) => row.at.includes(29))?.detail?.dryRun).toEqual([[3, "unreproducible"], [6, "unreproducible"]]);
    for (const at of [40, 44, 46]) {
      expect(completions.find((row) => row.at.includes(at))?.detail?.dryRun, `completion ${at}`).toBeUndefined();
    }
    const ids = shownAt(run, 47).map((entry) => entry.callId);
    expect(ids).not.toContain("core.dry_run.1");
    expect(ids).not.toContain("dryrun.1.3");
    // The newest page is the live one the model's own work left, `cartextract5`,
    // which dry runs 2-4 used to push out of the window.
    expect(ids).toContain("cartextract5");
    expect(ids.filter((id) => id.startsWith("dryrun.") || id.startsWith("core.dry_run."))).toEqual([]);
  });
});
