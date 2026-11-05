// A task's outcome in each state the answer turn draws, for building it with no Core
// behind it. Each is a fresh object on every read, on a made-up site, and each passes
// the contract's parsers (`tests/port.test.ts` says so), so what is built
// on them reads Core's real records. Spend and times are invented.

import type { ChatAttemptLoopCount, ChatTaskAttempt, ChatTaskOutcome, ChatTaskResult } from "../../chat/ports/index.ts";

const NO_LOOPS: ChatAttemptLoopCount = { steered: 0, refused: 0, changeApproach: 0, askPerson: 0 };
const STARTED_AT = 1_800_000_000_000;
const FIRST_MS = 194_000;

/** An attempt that has caught nothing yet. */
export function fakeNoLoopsCaught(): ChatTaskAttempt["loopsCaught"] {
  return {
    exact_repeat: { ...NO_LOOPS },
    near_repeat: { ...NO_LOOPS },
    cycle: { ...NO_LOOPS },
    no_progress: { ...NO_LOOPS },
    same_fix: { ...NO_LOOPS },
    same_act: { ...NO_LOOPS }
  };
}

function firstAttempt(): ChatTaskAttempt {
  return {
    taskId: "task-deals",
    attemptId: "attempt-deals-1",
    ordinal: 1,
    projectId: "project-1",
    flowId: "flow-deals",
    runId: "run-deals-1",
    path: "explore",
    status: "achieved",
    spend: { calls: 12, inputTokens: 18_000, outputTokens: 2_400, usd: 1.12, ms: FIRST_MS },
    budget: { usd: 5 },
    liveSteps: 31,
    simulation: { verdict: "passed", flags: 1 },
    loopsCaught: fakeNoLoopsCaught(),
    startedAtMs: STARTED_AT,
    endedAtMs: STARTED_AT + FIRST_MS
  };
}

/** Rows found and checked on a first try. Its draft passed against its recording and has not run live, so it is `partly_works` and `unproven`. */
function rowsChecked(): ChatTaskOutcome {
  return {
    attempt: firstAttempt(),
    result: {
      attemptId: "attempt-deals-1",
      kind: "rows",
      label: "confirmed",
      timesChecked: 2,
      source: "exploration",
      rows: {
        runId: "run-deals-1",
        datasetId: "deals",
        totalRows: 10,
        truncated: false,
        columns: [{ id: "title", label: "Title" }, { id: "price", label: "Price" }],
        previewRows: [{ title: "Blue kettle", price: 18.5 }, { title: "Steel toaster", price: 22 }, { title: "Glass jug", price: 9 }, { title: "Oak board", price: 14 }, { title: "Tin tray", price: 7.25 }]
      },
      acts: [],
      checkedWhat: "Right columns, cheapest first, no duplicates",
      from: [{ site: "shop.example", pages: "3 results pages" }]
    },
    saved: { state: "partly_works", trust: "unproven", flowId: "flow-deals", savedAtMs: STARTED_AT + FIRST_MS, simulation: "passed" }
  };
}

/** The same task again, from its saved steps at no model cost, told against the first time. */
function secondAttemptFromSaved(): ChatTaskOutcome {
  const ms = 18_000;
  const startedAtMs = STARTED_AT + 86_400_000;
  return {
    attempt: {
      taskId: "task-deals",
      attemptId: "attempt-deals-2",
      ordinal: 2,
      projectId: "project-1",
      flowId: "flow-deals",
      runId: "run-deals-2",
      path: "run_flow",
      status: "achieved",
      spend: { calls: 0, inputTokens: 0, outputTokens: 0, usd: 0, ms },
      budget: { usd: 5 },
      liveSteps: 9,
      simulation: { verdict: "not_run", flags: 0 },
      loopsCaught: fakeNoLoopsCaught(),
      startedAtMs,
      endedAtMs: startedAtMs + ms
    },
    result: {
      attemptId: "attempt-deals-2",
      kind: "rows",
      label: "confirmed",
      timesChecked: 1,
      source: "flow",
      rows: {
        runId: "run-deals-2",
        datasetId: "deals",
        totalRows: 10,
        truncated: false,
        columns: [{ id: "title", label: "Title" }, { id: "price", label: "Price" }],
        previewRows: [{ title: "Blue kettle", price: 18.5 }, { title: "Steel toaster", price: 22 }]
      },
      acts: [],
      checkedWhat: "Right columns, cheapest first, no duplicates",
      from: [{ site: "shop.example", pages: "3 results pages" }]
    },
    saved: { state: "ready", trust: "provisional", flowId: "flow-deals", savedAtMs: startedAtMs + ms, lastWorkedAtMs: startedAtMs + ms },
    comparedTo: firstAttempt()
  };
}

/** Lasting acts told from the act record: one that landed with an undo, one that may have. */
function doneOnSite(): ChatTaskOutcome {
  const ms = 96_000;
  return {
    attempt: {
      taskId: "task-cart",
      attemptId: "attempt-cart-1",
      ordinal: 1,
      projectId: "project-1",
      flowId: "flow-cart",
      runId: "run-cart-1",
      path: "explore",
      status: "achieved",
      spend: { calls: 7, inputTokens: 9_000, outputTokens: 1_100, usd: 0.48, ms },
      budget: { usd: 5 },
      liveSteps: 14,
      simulation: { verdict: "inconclusive", flags: 2 },
      loopsCaught: fakeNoLoopsCaught(),
      startedAtMs: STARTED_AT,
      endedAtMs: STARTED_AT + ms
    },
    result: {
      attemptId: "attempt-cart-1",
      kind: "done_on_site",
      label: "confirmed",
      timesChecked: 1,
      source: "exploration",
      acts: [
        { id: "act-1", what: "Added the blue kettle to the cart", where: "shop.example, product page", classes: ["modify_existing"], state: "landed", undo: { how: "Remove it from the cart" } },
        { id: "act-2", what: "Added the glass jug to the cart", where: "shop.example, product page", classes: ["modify_existing"], state: "may_have_landed" }
      ],
      checkedWhat: "The cart holds both items",
      from: [{ site: "shop.example", pages: "the cart page" }]
    },
    saved: { state: "partly_works", trust: "unproven", flowId: "flow-cart", savedAtMs: STARTED_AT + ms, simulation: "inconclusive" }
  };
}

/** A sentence in the model's words, checked, and told as the model's. There are no steps to save, only what it learned. */
function plainAnswerChecked(): ChatTaskOutcome {
  const ms = 21_000;
  return {
    attempt: {
      taskId: "task-hours",
      attemptId: "attempt-hours-1",
      ordinal: 1,
      projectId: "project-1",
      path: "explore",
      status: "achieved",
      spend: { calls: 3, inputTokens: 4_000, outputTokens: 300, usd: 0.09, ms },
      budget: { usd: 5 },
      liveSteps: 2,
      loopsCaught: fakeNoLoopsCaught(),
      startedAtMs: STARTED_AT,
      endedAtMs: STARTED_AT + ms
    },
    result: {
      attemptId: "attempt-hours-1",
      kind: "plain_answer",
      label: "confirmed",
      timesChecked: 1,
      source: "exploration",
      acts: [],
      answerText: { text: "The store is open until nine tonight.", author: "model" },
      checkedWhat: "The opening hours page says so",
      from: [{ site: "shop.example", pages: "the opening hours page" }]
    },
    saved: { state: "notes_only", trust: "unproven", savedAtMs: STARTED_AT + ms }
  };
}

/** The budget ran out with rows in hand: `rows` and `unverified` say it has them and nobody settled them. No tick, and a request to look. */
function rowsNotSure(): ChatTaskOutcome {
  return rowsAtBudgetOut("attempt-prices-1", "run-prices-1", { label: "unverified", timesChecked: 0 });
}

/** The budget ran out and the last check said the rows are wrong. Shown as a failed check, not hidden: it is what it got. */
function rowsRefuted(): ChatTaskOutcome {
  return rowsAtBudgetOut("attempt-prices-2", "run-prices-2", { label: "refuted", timesChecked: 2, checkedWhat: "They are not sorted cheapest first" });
}

function rowsAtBudgetOut(attemptId: string, runId: string, check: Pick<ChatTaskResult, "label" | "timesChecked" | "checkedWhat">): ChatTaskOutcome {
  const ms = 540_000;
  return {
    attempt: {
      taskId: "task-prices",
      attemptId,
      ordinal: 1,
      projectId: "project-1",
      flowId: "flow-prices",
      runId,
      path: "explore",
      status: "budget_out",
      spend: { calls: 38, inputTokens: 57_000, outputTokens: 8_900, usd: 5, ms },
      budget: { usd: 5 },
      liveSteps: 60,
      simulation: { verdict: "not_run", flags: 0 },
      loopsCaught: fakeNoLoopsCaught(),
      startedAtMs: STARTED_AT,
      endedAtMs: STARTED_AT + ms
    },
    result: {
      attemptId,
      kind: "rows",
      source: "exploration",
      rows: {
        runId,
        datasetId: "prices",
        totalRows: 2,
        truncated: false,
        columns: [{ id: "title", label: "Title" }, { id: "price", label: "Price" }],
        previewRows: [{ title: "Blue kettle", price: 18.5 }, { title: "Steel toaster", price: 22 }]
      },
      acts: [],
      from: [{ site: "shop.example", pages: "2 results pages" }],
      ...check
    },
    saved: { state: "partly_works", trust: "unproven", flowId: "flow-prices", savedAtMs: STARTED_AT + ms, simulation: "not_run" }
  };
}

/** The one failure ending: the budget is gone, with what it got, what it saved, and what is missing. */
function budgetOutPartial(): ChatTaskOutcome {
  const ms = 610_000;
  const caught = fakeNoLoopsCaught();
  caught.near_repeat = { steered: 2, refused: 1, changeApproach: 0, askPerson: 0 };
  return {
    attempt: {
      taskId: "task-listings",
      attemptId: "attempt-listings-1",
      ordinal: 1,
      projectId: "project-1",
      flowId: "flow-listings",
      runId: "run-listings-1",
      path: "explore",
      status: "budget_out",
      spend: { calls: 41, inputTokens: 61_000, outputTokens: 9_800, usd: 5, ms },
      budget: { usd: 5 },
      liveSteps: 74,
      simulation: { verdict: "not_run", flags: 0 },
      loopsCaught: caught,
      startedAtMs: STARTED_AT,
      endedAtMs: STARTED_AT + ms
    },
    result: {
      attemptId: "attempt-listings-1",
      kind: "partial",
      label: "unverified",
      timesChecked: 0,
      source: "exploration",
      rows: {
        runId: "run-listings-1",
        datasetId: "listings",
        totalRows: 3,
        truncated: false,
        columns: [{ id: "title", label: "Title" }, { id: "city", label: "City" }],
        previewRows: [{ title: "Corner flat", city: "Leeds" }, { title: "Garden room", city: "York" }, { title: "Top floor", city: "Hull" }]
      },
      acts: [],
      missingWhat: "The rest of the listings past the first page",
      from: [{ site: "homes.example", pages: "1 results page" }]
    },
    saved: { state: "partly_works", trust: "unproven", flowId: "flow-listings", savedAtMs: STARTED_AT + ms, simulation: "not_run" }
  };
}

/** Still spending, with nothing to show yet. */
function working(): ChatTaskOutcome {
  return {
    attempt: {
      taskId: "task-jobs",
      attemptId: "attempt-jobs-1",
      ordinal: 1,
      projectId: "project-1",
      path: "explore",
      status: "working",
      spend: { calls: 4, inputTokens: 5_200, outputTokens: 610, usd: 0.34, ms: 72_000 },
      budget: { usd: 5 },
      liveSteps: 6,
      loopsCaught: fakeNoLoopsCaught(),
      startedAtMs: STARTED_AT
    }
  };
}

function waiting(waitingFor: Extract<ChatTaskAttempt, { status: "waiting_for_person" }>["waitingFor"], name: string, loopsCaught: ChatTaskAttempt["loopsCaught"]): ChatTaskOutcome {
  return {
    attempt: {
      taskId: `task-${name}`,
      attemptId: `attempt-${name}-1`,
      ordinal: 1,
      projectId: "project-1",
      flowId: `flow-${name}`,
      path: "explore",
      status: "waiting_for_person",
      waitingFor,
      spend: { calls: 2, inputTokens: 2_400, outputTokens: 200, usd: 0.11, ms: 30_000 },
      budget: { usd: 5 },
      liveSteps: 3,
      loopsCaught,
      startedAtMs: STARTED_AT
    },
    saved: { state: "needs_you", trust: "unproven", flowId: `flow-${name}`, savedAtMs: STARTED_AT + 30_000 }
  };
}

/** Waiting at something only a person can do, with its remaining budget. Not an ending. */
function waitingForPerson(): ChatTaskOutcome {
  return waiting("person_only_check", "sign-in", fakeNoLoopsCaught());
}

/** Waiting for the person to unlock their model key: a setup step with one action. Not an ending. */
function waitingForModelKey(): ChatTaskOutcome {
  return waiting("model_key_locked", "key", fakeNoLoopsCaught());
}

/** Waiting on a press of Allow for a dangerous act. Not an ending. */
function waitingForPermission(): ChatTaskOutcome {
  return waiting("permission", "order", fakeNoLoopsCaught());
}

/** Fresh approaches looped too, so it stopped spending and asked, keeping the best so far. Not an ending: "I keep getting stuck on this. Here is what I have." */
function stuckInALoop(): ChatTaskOutcome {
  const caught = fakeNoLoopsCaught();
  caught.cycle = { steered: 3, refused: 2, changeApproach: 2, askPerson: 1 };
  const outcome = waiting("stuck_in_a_loop", "pages", caught);
  outcome.result = {
    attemptId: "attempt-pages-1",
    kind: "partial",
    label: "unverified",
    timesChecked: 0,
    source: "exploration",
    acts: [],
    missingWhat: "Everything past the first page",
    from: [{ site: "shop.example", pages: "1 results page" }]
  };
  return outcome;
}

/** A person pressed Stop: nothing to show, and nothing claimed. */
/** Its Core restarted while it was working. Not an ending: it carries on from what it kept. */
function interruptedByRestart(): ChatTaskOutcome {
  return waiting("interrupted", "restart", fakeNoLoopsCaught());
}

function stoppedByPerson(): ChatTaskOutcome {
  const ms = 44_000;
  return {
    attempt: {
      taskId: "task-news",
      attemptId: "attempt-news-1",
      ordinal: 1,
      projectId: "project-1",
      path: "explore",
      status: "stopped_by_person",
      spend: { calls: 3, inputTokens: 3_100, outputTokens: 280, usd: 0.15, ms },
      budget: { usd: 5 },
      liveSteps: 4,
      loopsCaught: fakeNoLoopsCaught(),
      startedAtMs: STARTED_AT,
      endedAtMs: STARTED_AT + ms
    },
    result: {
      attemptId: "attempt-news-1",
      kind: "partial",
      label: "unverified",
      timesChecked: 0,
      source: "exploration",
      acts: []
    }
  };
}

/** Each state, made fresh, so a test may change what it is given. */
export function fakeTaskOutcomes() {
  return {
    rowsChecked: rowsChecked(),
    secondAttemptFromSaved: secondAttemptFromSaved(),
    doneOnSite: doneOnSite(),
    plainAnswerChecked: plainAnswerChecked(),
    rowsNotSure: rowsNotSure(),
    rowsRefuted: rowsRefuted(),
    budgetOutPartial: budgetOutPartial(),
    working: working(),
    waitingForPerson: waitingForPerson(),
    waitingForPermission: waitingForPermission(),
    waitingForModelKey: waitingForModelKey(),
    stuckInALoop: stuckInALoop(),
    interruptedByRestart: interruptedByRestart(),
    stoppedByPerson: stoppedByPerson()
  };
}
