// @fluxiq-test-group real-sql
// The keep-going table's rows about one call: a step that failed, a tool that threw, and a lasting
// act whose effect is not known. None ends a task, and none repeats a lasting act blind.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../../../../../runtime/llm/index.ts";
import { complete, fakeLibrary, LOOK_TOOL, READ_LOANS, RENEW_CARD, runNode, scriptedAttempt, toolCall } from "../../fake-library.ts";
import { expectPresses, expectReached, noWaiting } from "../support.ts";

vi.setConfig({ testTimeout: 120_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const refused = (code: string): AutomationStudioLlmEvidenceToolExecutionResult => ({
  kind: "llm_evidence_tool_execution", evidence: { ok: false, code }, effectApplied: false,
  failure: { category: "target_not_found", code, retryable: true, stage: "dispatch" }, resultCode: `web.action.rejected.${code}`
});

describe("one call that goes wrong never ends a task", () => {
  it("a failing step is told to the model, and the task reaches its result", async () => {
    let failures = 1;
    const attempt = await scriptedAttempt({
      fault: (call) => call.value.node === READ_LOANS && failures-- > 0 ? refused("target_not_found") : undefined,
      script: [
        runNode("read.bad", READ_LOANS, { from: "the wrong list" }, [], { add: true }),
        (request) => {
          expect(JSON.stringify(request.context.evidenceLoop?.evidence)).toContain("target_not_found");
          return runNode("read", READ_LOANS, {}, [], { add: true });
        },
        complete("Listed.")
      ]
    }, cleanups);
    const answer = expectReached(attempt);
    expect(answer.result?.rows?.totalRows).toBe(3);
    expectPresses(attempt, {});
  });

  it("a tool that throws is told to the model, and the task reaches its result", async () => {
    let throws = 1;
    let told = "";
    const attempt = await scriptedAttempt({
      before: noWaiting(),
      fault: (call) => {
        if (call.value.node === READ_LOANS && throws-- > 0) throw new Error("The socket went away.");
        return undefined;
      },
      script: [
        runNode("read.bad", READ_LOANS, { from: "somewhere" }, [], { add: true }),
        (request) => {
          told = JSON.stringify(request.context.evidenceLoop?.evidence);
          return runNode("read", READ_LOANS, {}, [], { add: true });
        },
        complete("Listed.")
      ]
    }, cleanups);
    const answer = expectReached(attempt);
    expect(answer.result?.rows?.totalRows).toBe(3);
    // It is told a call failed, and never the error's own words, which may quote the page.
    expect(told).toMatch(/tool_failed|read\.bad/u);
    expect(told).not.toContain("The socket went away.");
  });

  it("an uncertain lasting act on a page that has not moved is not pressed again, and the task goes on", async () => {
    let uncertain = 1;
    const library = fakeLibrary();
    let told = "";
    const attempt = await scriptedAttempt({
      library,
      instruction: "Renew the card on my library account.",
      permittedConsequences: ["modify_existing"],
      fault: (call) => call.value.node === RENEW_CARD && uncertain-- > 0 ? {
        kind: "llm_evidence_tool_execution", evidence: { ok: true, status: "uncertain" }, effectApplied: false, resultReason: "outcome_uncertain",
        draft: { actionId: RENEW_CARD, input: call.value, effect: "mutate", proposes: true, ranWith: { node: RENEW_CARD, parameters: {}, consequences: ["modify_existing"] } }
      } : undefined,
      script: [
        runNode("card", RENEW_CARD, {}, ["modify_existing"], { add: true }),
        toolCall("look", LOOK_TOOL, { again: true }),
        runNode("card.again", RENEW_CARD, {}, ["modify_existing"], {}),
        (request) => {
          told = JSON.stringify(request.context.evidenceLoop?.evidence);
          return complete("The act may have landed; here is what the page shows.", "It may have been renewed.");
        }
      ]
    }, cleanups);
    expect(told).toContain("repeat_refused");
    const answer = expectReached(attempt);
    expect(library.calls.filter((call) => call.value.node === RENEW_CARD)).toHaveLength(1);
    expect(answer.result?.acts[0]).toMatchObject({ state: "may_have_landed" });
  });

  it("a lasting act whose call threw is held to a look, and is then not pressed again", async () => {
    const seen: string[] = [];
    let throws = 1;
    const attempt = await scriptedAttempt({
      instruction: "Renew the card on my library account.",
      permittedConsequences: ["modify_existing"],
      before: noWaiting(),
      fault: (call, library) => {
        if (call.value.node !== RENEW_CARD || throws-- <= 0) return undefined;
        // It landed, and the answer was lost.
        library.renewals.card = (library.renewals.card ?? 0) + 1;
        throw new Error("The socket went away.");
      },
      script: [
        runNode("card", RENEW_CARD, {}, ["modify_existing"], { add: true }),
        runNode("card.blind", RENEW_CARD, {}, ["modify_existing"], {}),
        (request) => {
          seen.push(JSON.stringify(request.context.evidenceLoop?.evidence));
          return toolCall("look", LOOK_TOOL, { again: true });
        },
        (request) => {
          // The page shows it happened, so the model counts it as done.
          expect(JSON.stringify(request.context.evidenceLoop?.evidence)).toContain("renewed");
          return complete("The page shows the card renewed.");
        }
      ]
    }, cleanups);
    expect(seen[0]).toContain("attempt.act_look_first");
    const answer = expectReached(attempt);
    expectPresses(attempt, { card: 1 });
    expect(attempt.library.calls.filter((call) => call.value.node === RENEW_CARD)).toHaveLength(1);
    expect(answer.result?.acts[0]).toMatchObject({ state: "may_have_landed" });
  });

  it("an uncertain lasting act is looked at, never repeated blind, and may be retried after the look", async () => {
    const seen: string[] = [];
    let uncertain = 1;
    const library = fakeLibrary();
    const looked = () => {
      library.shelf = "the page has moved on";
      return toolCall("look", LOOK_TOOL, { again: true });
    };
    const attempt = await scriptedAttempt({
      library,
      instruction: "Renew the card on my library account.",
      permittedConsequences: ["modify_existing"],
      // Core left it uncertain and it did not land: the look shows no renewal, so a retry is right.
      fault: (call) => call.value.node === RENEW_CARD && uncertain-- > 0 ? {
        kind: "llm_evidence_tool_execution", evidence: { ok: true, status: "uncertain" }, effectApplied: false, resultReason: "outcome_uncertain",
        draft: { actionId: RENEW_CARD, input: call.value, effect: "mutate", proposes: true, ranWith: { node: RENEW_CARD, parameters: {}, consequences: ["modify_existing"] } }
      } : undefined,
      script: [
        runNode("card", RENEW_CARD, {}, ["modify_existing"], { add: true }),
        runNode("card.blind", RENEW_CARD, {}, ["modify_existing"], {}),
        (request) => {
          seen.push(JSON.stringify(request.context.evidenceLoop?.evidence));
          return looked();
        },
        toolCall("card.after", "core.run_node", { node: RENEW_CARD, parameters: {}, consequences: ["modify_existing"], reason: "The page shows no renewal." }),
        complete("Renewed the card.")
      ]
    }, cleanups);
    // Refused before it was sent, by the guard or the record, whichever stands first.
    expect(seen[0]).toMatch(/attempt\.act_look_first|repeat_refused/u);
    const answer = expectReached(attempt);
    // Two calls reached the target: the uncertain one, and the one after the look. The blind one never did.
    expect(library.calls.filter((call) => call.value.node === RENEW_CARD)).toHaveLength(2);
    expectPresses(attempt, { card: 1 });
    expect(answer.result?.acts[0]).toMatchObject({ state: "landed" });
  });
});
