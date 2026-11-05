// @fluxiq-test-group real-sql
// A row the act record holds done is told to the person (t870), through the real service, the real
// engine and a scripted model on a lending library. Provider-free: the model and the judge are scripts.
//
// **What the count reads.** Rows this attempt left out because the record held them done: a Flow run or a
// forward run passing over them, or a press refused. A model that keeps away from them by itself, from what
// it was told, left nothing out as far as the record can know, so that attempt has no count.
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseAutomationStudioTaskResult } from "@fluxiq/contracts/automation";
import type { AutomationStudioLlmTaskRequest } from "../../../../../runtime/llm/index.ts";
import { judgedNo } from "./endings/support.ts";
import { complete, RENEW_LOAN, runNode } from "./fake-library.ts";
import { LOAN_STEP, LOAN_TASK, READ_STEP, repeatOverRows } from "./honest-attempts.ts";
import { laterAttempts, readLoans } from "./later-attempts.ts";
import { forwardFrom, pressLoanByHand } from "./library-site.ts";

vi.setConfig({ testTimeout: 180_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const TITLES = ["Atlas of Rivers", "Birds of the Coast", "Clockmaking", "Dune Walks"];
const [ATLAS, BIRDS, CLOCKS, DUNES] = TITLES as [string, string, string, string];
const PERMITTED = { instruction: LOAN_TASK, permittedConsequences: ["modify_existing" as const] };
const press = (title: string, over: { add?: true } = { add: true }) => runNode(`renew.${title.replace(/\W+/gu, "-")}`, RENEW_LOAN, { title }, ["modify_existing"], over);
/** A purse with room for the read and two presses, and little past them. */
const TIGHT = { ...PERMITTED, costUsd: 0.04, maxTotalEstimatedCostUsd: 0.09, keepLooking: true };

describe("rows skipped as already done", () => {
  it("a second attempt's Flow run leaves the two rows the first did alone and says so, and the first said nothing", async () => {
    const lane = await laterAttempts(cleanups, { titles: TITLES });
    const first = await lane.attempt({ ...TIGHT, script: [readLoans(), press(ATLAS), press(BIRDS)] });
    expect(first.answer.attempt.status).toBe("budget_out");
    expect(lane.target.library.renewals).toEqual({ [ATLAS]: 1, [BIRDS]: 1 });
    expect(first.answer.result).not.toHaveProperty("skippedAsDone");

    const second = await lane.attempt({ ...PERMITTED, judge: [judgedNo("Two loans were not renewed.")], script: [press(CLOCKS), press(DUNES), complete("All renewed.")] });
    expect(second.answer.attempt.status).toBe("achieved");
    expect(second.answer.result).toMatchObject({ skippedAsDone: 2 });
    expect(parseAutomationStudioTaskResult(second.answer.result).ok).toBe(true);
    expect(lane.target.library.renewals).toEqual(Object.fromEntries(TITLES.map((title) => [title, 1])));
  });

  it("a repeat over the rows does the same, on a row the first attempt pressed by hand", async () => {
    const lane = await laterAttempts(cleanups, { titles: TITLES });
    const first = await lane.attempt({ ...TIGHT, script: [readLoans(), pressLoanByHand("first", ATLAS), repeatOverRows(LOAN_STEP)] });
    expect(first.answer.attempt.status).toBe("budget_out");
    const second = await lane.attempt({ ...PERMITTED, script: [complete("All renewed.")] });
    expect(second.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow" });
    expect(second.answer.result).toMatchObject({ skippedAsDone: 1 });
    expect(lane.target.library.renewals).toEqual(Object.fromEntries(TITLES.map((title) => [title, 1])));
  });

  it("a model that keeps away from done rows by itself left nothing out", async () => {
    const lane = await laterAttempts(cleanups, { titles: TITLES });
    // Not added to the Flow, so nothing is run before the rounds, and only its record carries.
    await lane.attempt({ ...TIGHT, script: [readLoans("read", {}), press(ATLAS, {}), press(BIRDS, {})] });
    const second = await lane.attempt({ ...PERMITTED, script: [press(CLOCKS, {}), press(DUNES, {}), complete("All renewed.")] });
    expect(second.answer.attempt.status).toBe("achieved");
    expect(second.answer.result).not.toHaveProperty("skippedAsDone");
    expect(second.answer.result?.acts).toHaveLength(4);
  });

  it("an attempt that held nothing done has no field", async () => {
    const lane = await laterAttempts(cleanups, { titles: TITLES });
    const only = await lane.attempt({ ...PERMITTED, script: [readLoans(), press(ATLAS), press(BIRDS), press(CLOCKS), press(DUNES), complete("All renewed.")] });
    expect(only.answer.attempt.status).toBe("achieved");
    expect(only.answer.result).not.toHaveProperty("skippedAsDone");
  });
});

describe("two rows nothing separates, which a forward run reads as done", () => {
  /** A list whose first two rows are the same to every value a read returns. */
  const twoAlike = async () => {
    const lane = await laterAttempts(cleanups, { titles: [ATLAS, ATLAS, BIRDS] });
    for (const loan of lane.target.library.loans) loan.due = "2030-02-02";
    return lane;
  };

  it("are both left out, and the person's card says so, with what the model was told by count", async () => {
    const lane = await twoAlike();
    const shown: string[] = [];
    const finished = await lane.attempt({ ...PERMITTED, script: [
      readLoans(), press(ATLAS), repeatOverRows(LOAN_STEP, READ_STEP), forwardFrom(READ_STEP),
      (request: AutomationStudioLlmTaskRequest) => {
        shown.push(JSON.stringify(request.context.evidenceLoop?.evidence ?? []));
        return complete("Renewed what could be told apart.");
      }
    ] });
    expect(finished.answer.attempt.status).toBe("achieved");
    // One press on the title and none past it: a lasting act is never done twice, and that is why a row is left out.
    expect(lane.target.library.renewals).toEqual({ [ATLAS]: 1, [BIRDS]: 1 });
    expect(shown.join()).toMatch(/"skipped":2/u);
    expect(finished.answer.result).toMatchObject({ skippedAsDone: 2 });
    expect(parseAutomationStudioTaskResult(finished.answer.result).ok).toBe(true);
  });
});
