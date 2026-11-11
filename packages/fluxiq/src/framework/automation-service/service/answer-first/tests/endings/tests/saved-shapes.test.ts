// @fluxiq-test-group real-sql
// The shapes of the failed saved runs loop detection did not fire on (loop-detection report, item
// 4), as this path meets them. The path keeps going through each, and these say what bounds it:
//
//   - A new revision each time, judged no. Each fix differs, so the digest rule cannot refuse it
//     when its evidence changed, and it may spend one judge call per change. An unchanged summary
//     gets no call at all, and the purse bounds the rest.
//   - Still moving, never arriving: new pages and landed acts read as progress, so no pattern
//     fires, and only the purse ends it. That is the plan's stated consequence.
//   - A fight with the reset gate: this path has no reset to fight. A model that asks for one is
//     refused the same way every time, and the repeat guard takes it from there.
import { afterEach, describe, expect, it, vi } from "vitest";
import { complete, fakeLibrary, LOOK_TOOL, READ_LOANS, RENEW_LOAN, runNode, scriptedAttempt, toolCall } from "../../fake-library.ts";
import { answerOf, decisions, expectEnded, expectPresses, expectReached, judgeCalls, judgedNo, noWaiting } from "../support.ts";

vi.setConfig({ testTimeout: 180_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const USAGE = { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.02 };

describe("the saved-run shapes", () => {
  it("a new revision each time judged no: an unchanged summary costs no judge call, and a changed one reaches the result", async () => {
    const library = fakeLibrary();
    let revision = 0;
    const attempt = await scriptedAttempt({
      library,
      judge: [judgedNo("Not it."), judgedNo("Still not it."), judgedNo("Not that either.")],
      script: [
        // Each revision is different and reads something new, so the evidence the judge is shown changes with it.
        ...Array.from({ length: 4 }, () => [
          () => {
            revision += 1;
            library.shelf = `revision ${revision}`;
            return runNode(`read.${revision}`, READ_LOANS, { revision }, [], { add: true });
          },
          complete("This should do it."),
          complete("The same evidence, said another way.")
        ]).flat().slice(0, -1)
      ]
    }, cleanups);
    const answer = expectReached(attempt);
    // Four changed summaries, four judge calls; three more completions on the same evidence, and no call for any of them.
    expect(judgeCalls(attempt)).toHaveLength(4);
    expect(answer.result?.timesChecked).toBe(4);
    expect(decisions(attempt).map((request) => JSON.stringify(request.context.evidenceLoop?.evidence ?? [])).join("\n")).toContain("answer_first.same_evidence");
  });

  // R7: a stuck attempt is steered and never parks, with or without a person to ask (refused-completion.test.ts); a task ends only with its result, its budget or a Stop.
  it("the same refused evidence again and again spends no judge call, and with nobody to ask it is steered on until the purse ends it", async () => {
    const attempt = await scriptedAttempt({
      judge: [judgedNo("Not it.")],
      usage: USAGE,
      resolver: { maxTotalEstimatedCostUsd: 0.4 },
      wrapProvider: (provider) => ({ ...provider, estimateCostUsd: () => 0.02 }),
      before: (service) => {
        noWaiting()(service);
        Object.defineProperty(service.conversations, "available", { value: false });
      },
      keepLooking: true,
      script: [runNode("read", READ_LOANS, {}, [], { add: true }), ...Array.from({ length: 200 }, () => complete("It is done."))]
    }, cleanups);
    expect(attempt.hung).toBe(false);
    expect(judgeCalls(attempt)).toHaveLength(1);
    const answer = answerOf(attempt);
    expect(answer.attempt.status).toBe("budget_out");
    expect(answer.attempt).not.toHaveProperty("waitingFor");
    expect(answer.result).toMatchObject({ label: "refuted", timesChecked: 1 });
  });

  it("still moving, never arriving: new pages and new acts read as progress, no judge is asked, and only the purse ends it", async () => {
    const library = fakeLibrary();
    let moved = 0;
    const attempt = await scriptedAttempt({
      library,
      instruction: "Renew the loan the page recommends.",
      permittedConsequences: ["modify_existing"],
      usage: USAGE,
      resolver: { maxTotalEstimatedCostUsd: 0.4 },
      wrapProvider: (provider) => ({ ...provider, estimateCostUsd: () => 0.02 }),
      before: noWaiting(),
      keepLooking: true,
      script: Array.from({ length: 200 }, () => () => {
        moved += 1;
        library.shelf = `shelf ${moved}`;
        return moved % 2 === 0 ? runNode(`renew.${moved}`, RENEW_LOAN, { title: `Loan ${moved}` }, ["modify_existing"], {}) : toolCall(`look.${moved}`, LOOK_TOOL, { shelf: moved });
      })
    }, cleanups);
    const answer = expectEnded(attempt, "budget_out");
    expect(judgeCalls(attempt)).toEqual([]);
    expect(answer.attempt.spend.usd).toBeLessThanOrEqual(0.4);
    // Every act was another target's, once each.
    expect(Object.values(library.renewals).every((times) => times === 1)).toBe(true);
    expect(answer.result?.label).toBe("unverified");
    // Nothing fired on it: this shape is what the purse is for.
    expect(Object.values(answer.attempt.loopsCaught).reduce((sum, each) => sum + each.changeApproach + each.askPerson, 0)).toBe(0);
  });

  it("a fight with the reset gate has no gate to fight: a rerun that would put the page back is refused, the stall is a fresh round, and the result is reached", async () => {
    const seen: string[] = [];
    const library = fakeLibrary();
    let fresh = false;
    const attempt = await scriptedAttempt({
      library,
      before: noWaiting(),
      permittedConsequences: ["modify_existing"],
      instruction: "List every loan on my library account.",
      script: [
        runNode("read", READ_LOANS, {}, [], { add: true }),
        ...Array.from({ length: 60 }, () => (request: Parameters<Exclude<Parameters<typeof scriptedAttempt>[0]["script"][number], Record<string, unknown>>>[0]) => {
          const evidence = JSON.stringify(request.context.evidenceLoop?.evidence);
          seen.push(evidence);
          fresh ||= evidence.includes("core.attempt_note");
          return fresh ? complete("Listed.") : { kind: "amend_draft", amendments: [{ step: 1, change: "rerun", input: { node: READ_LOANS, parameters: { sorted: true } } }] };
        })
      ]
    }, cleanups);
    const answer = expectReached(attempt);
    expect(answer.result?.rows?.totalRows).toBe(3);
    expect(library.calls.filter((call) => call.value.replay === "reset")).toEqual([]);
    expectPresses(attempt, {});
  });
});
