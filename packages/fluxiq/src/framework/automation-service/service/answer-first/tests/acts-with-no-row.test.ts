// @fluxiq-test-group real-sql
// The count of lasting acts no read could tie to a row (t869) reaches the kept attempt and survives a carry-on, through the
// real service, with a scripted model on a lending library. Provider-free. A press that names a loan no list holds ties to no
// row, and a second read of the same list shows nothing changed: the known limit of `act-record/tests/thin-press.test.ts`.
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseAutomationStudioTaskAttempt } from "@fluxiq/contracts/automation";
import { automationStudioAnswerFirstCarryOn } from "../index.ts";
import { complete, RENEW_LOAN, runNode } from "./fake-library.ts";
import { laterAttempts, readLoans } from "./later-attempts.ts";

vi.setConfig({ testTimeout: 180_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const TITLES = ["Atlas of Rivers", "Birds of the Coast", "Clockmaking", "Dune Walks"];
const PERMITTED = { instruction: "Renew a loan on my library account.", permittedConsequences: ["modify_existing" as const] };
const press = (title: string) => runNode(`renew.${title.replace(/\W+/gu, "-")}`, RENEW_LOAN, { title }, ["modify_existing"], {});
const UNLISTED = "Zephyr Tales";

describe("acts with no row, on the kept attempt", () => {
  it("a press tied to its row is counted zero", async () => {
    const lane = await laterAttempts(cleanups, { titles: TITLES });
    const run = await lane.attempt({ ...PERMITTED, script: [readLoans("read", {}), press(TITLES[0]!), readLoans("read2", {}), complete("Done.")] });
    expect(run.answer.attempt.status).toBe("achieved");
    expect(run.answer.attempt.actsWithNoRow ?? 0).toBe(0);
  });

  it("a press no read could tie to a row is counted on the attempt, and the count survives a carry-on", async () => {
    const lane = await laterAttempts(cleanups, { titles: TITLES });
    const first = await lane.attempt({ ...PERMITTED, costUsd: 0.04, maxTotalEstimatedCostUsd: 0.12, keepLooking: true, script: [readLoans("read", {}), press(UNLISTED), readLoans("read2", {})] });
    expect(first.answer.attempt.status).toBe("budget_out");
    expect(first.answer.attempt.actsWithNoRow).toBe(1);
    expect((await lane.rows()).at(-1)!.attempt.actsWithNoRow).toBe(1);
    expect(parseAutomationStudioTaskAttempt((await lane.rows()).at(-1)!.attempt).ok).toBe(true);

    const pressed = await automationStudioAnswerFirstCarryOn(lane.service, lane.stores, { projectId: lane.projectId, attemptId: first.answer.attempt.attemptId, addUsd: 0.4 }, () => lane.attempt({ ...PERMITTED, costUsd: 0.04, script: [complete("Done.")] }));
    if (!pressed.ok) throw new Error(pressed.refused);
    const second = await pressed.finished;
    expect(second.answer.attempt).toMatchObject({ attemptId: first.answer.attempt.attemptId, actsWithNoRow: 1 });
  });
});
