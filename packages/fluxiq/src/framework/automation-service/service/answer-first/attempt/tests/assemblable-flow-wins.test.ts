// @fluxiq-test-group real-sql
// A Flow that assembles wins over one that does not, and a repair is told what did not assemble
// (run-mwblz4aq): attempt 1 got its result but left a repeat that cannot end, so its steps are no
// Flow; attempt 2 repaired them on the repair route, which never runs the kept Flow, and saved a
// draft that assembles; attempt 3 must start from that one, not from attempt 1's again. Through the
// real service, the real assembly and a scripted model. Provider-free.
import { afterEach, describe, expect, it, vi } from "vitest";
import { complete } from "../../tests/fake-library.ts";
import { laterAttempts, readLoans, toldTo } from "../../tests/later-attempts.ts";

vi.setConfig({ testTimeout: 180_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

// Attempt 1's steps: its opening look at 1, the read at 2.
const READ_STEP = 2;
/** A repeat while the read itself succeeds: a read has no way to say the loop is done, so the draft cannot be made into a Flow. */
const repeatWhileItSucceeds = { kind: "amend_draft", amendments: [{ step: READ_STEP, change: "repeat", while: READ_STEP }] };

describe("a kept Flow that does not assemble", () => {
  it("loses to the repair that assembles, the repair is told why at which step, and the next attempt starts from the repair", async () => {
    const lane = await laterAttempts(cleanups);

    const first = await lane.attempt({ script: [readLoans(), repeatWhileItSucceeds, complete("Listed.")] });
    expect(first.answer.attempt.status).toBe("achieved");
    expect(first.answer.candidateId).toBeUndefined();
    const afterFirst = await lane.kept();
    expect(afterFirst?.best).toMatchObject({ attemptId: first.answer.attempt.attemptId, label: "confirmed" });
    expect(afterFirst?.best?.candidateId).toBeUndefined();

    const second = await lane.attempt({ script: [readLoans("again"), { kind: "amend_draft", amendments: [{ step: READ_STEP, change: "drop" }] }, complete("Listed.")] });
    expect(second.answer.attempt.status).toBe("achieved");
    const afterSecond = await lane.kept();
    expect(afterSecond?.attempts.at(-1)).toMatchObject({ route: "repair", startedFrom: { attemptId: first.answer.attempt.attemptId } });
    // The repairing model is told which step did not assemble, and why in Core's own sentence.
    const told = toldTo(second.decisions[0])?.flowRun as { issues?: { code: string; step?: number; said?: string }[] } | undefined;
    expect(told?.issues).toContainEqual({ code: "flow_draft.repeat_while_never_ends", step: READ_STEP, said: expect.stringMatching(new RegExp(`^Step ${READ_STEP} repeats while step ${READ_STEP} succeeds`, "u")) });
    // The repair's draft assembled and was saved: it is the task's best now, though both were confirmed and nothing ran live.
    expect(second.answer.candidateId).toBeDefined();
    expect(afterSecond?.best).toMatchObject({ attemptId: second.answer.attempt.attemptId, candidateId: second.answer.candidateId, label: "confirmed" });

    const third = await lane.attempt({ script: [readLoans("third"), complete("Listed.")] });
    expect((await lane.kept())?.attempts.at(-1)).toMatchObject({ route: "use", startedFrom: { attemptId: second.answer.attempt.attemptId } });
    expect(third.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow" });
  });
});
