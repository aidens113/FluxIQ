// @fluxiq-test-group real-sql
// An attempt driven from code (fluxnode-plan P2a): each per-call seam through the real service, with
// a scripted model and the lending library's stub target (`../../tests/fake-library.ts`). The call
// carries neither `authoringMode` nor `evidenceGuided`: the caller's options alone ask for answer-first.
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkAutomationStudioTaskAttemptResult } from "@fluxiq/contracts/automation";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioLlmProvider, AutomationStudioLlmProviderResolverInput } from "../../../../../../runtime/llm/index.ts";
import type { AutomationStudioAnswerFirstCallerOptions } from "../../../flow-bootstrap-commands/index.ts";
import { complete, LOOK_TOOL, READ_LOANS, RENEW_CARD, runNode, scriptedAttempt, toolCall } from "../../tests/fake-library.ts";
import { laterAttempts, readLoans } from "../../tests/later-attempts.ts";
import { drivenBy } from "./caller-driven.ts";

vi.setConfig({ testTimeout: 180_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const LIST = "List every loan on my library account.";

function answered(attempt: { answered: Awaited<ReturnType<typeof scriptedAttempt>>["answered"] }) {
  if (attempt.answered.status !== "answered") throw new Error(`expected an answer, got ${JSON.stringify(attempt.answered)}`);
  return attempt.answered;
}

const judgeCalls = (attempt: { requests: readonly { taskKind: string }[] }) => attempt.requests.filter((request) => request.taskKind === "loop_verification").length;
const evidenceOf = (request: { context: { evidenceLoop?: { evidence: unknown } } }) => JSON.stringify(request.context.evidenceLoop?.evidence ?? null);
const threeLoans: NonNullable<AutomationStudioAnswerFirstCallerOptions["check"]> = (summary) => summary.rows?.totalRows === 3 || "expected the three loans";

describe("a caller's check", () => {
  it("passing, confirms with no judge call, by the check, and needs no answer-first flag", async () => {
    const attempt = await scriptedAttempt({
      instruction: LIST,
      script: [runNode("read", READ_LOANS, {}, [], { add: true }), complete("Listed.")],
      before: (service) => drivenBy(service, () => ({ check: threeLoans }))
    }, cleanups);
    const answer = answered(attempt);
    expect(answer.attempt.status).toBe("achieved");
    expect(answer.result).toMatchObject({ kind: "rows", label: "confirmed", timesChecked: 1, checkedWhat: "The caller's own check of the result." });
    expect(answer.confirmedBy).toBe("check");
    expect(judgeCalls(attempt)).toBe(0);
  });

  it("failing, is a no whose reason goes back into the rounds, and the attempt goes on to the result", async () => {
    const said: string[] = [];
    const attempt = await scriptedAttempt({
      instruction: "List every loan on my library account and renew the card.",
      permittedConsequences: ["modify_existing"],
      script: [
        runNode("read", READ_LOANS, {}, [], { add: true }),
        complete("Listed."),
        (request) => {
          said.push(evidenceOf(request));
          return runNode("card", RENEW_CARD, {}, ["modify_existing"], { add: true });
        },
        complete("Listed, and renewed the card.")
      ],
      before: (service) => drivenBy(service, () => ({ check: (summary) => summary.acts.some((act) => act.state === "landed") || "the card is not renewed yet" }))
    }, cleanups);
    const answer = answered(attempt);
    expect(said[0]).toContain("answer_first.check_no");
    expect(said[0]).toContain("the card is not renewed yet");
    expect(answer.attempt.status).toBe("achieved");
    expect(answer.confirmedBy).toBe("check");
    expect(answer.result).toMatchObject({ label: "confirmed", timesChecked: 2 });
    expect(attempt.library.renewals).toEqual({ card: 1 });
    expect(judgeCalls(attempt)).toBe(0);
  });
});

describe("the judge's mode, through the service", () => {
  it("off with no check: achieved with no judge call, its result unverified, marked checking off, and never stored as a person's Stop", async () => {
    const attempt = await scriptedAttempt({
      instruction: LIST,
      script: [runNode("read", READ_LOANS, {}, [], { add: true }), complete("Listed.")],
      before: (service) => drivenBy(service, () => ({ judge: "off" }))
    }, cleanups);
    const answer = answered(attempt);
    expect(judgeCalls(attempt)).toBe(0);
    expect(answer.confirmedBy).toBe("none");
    expect(answer.attempt).toMatchObject({ status: "achieved", checkingOff: true });
    expect(answer.result).toMatchObject({ kind: "rows", label: "unverified", timesChecked: 0 });
    expect(checkAutomationStudioTaskAttemptResult(answer.attempt, answer.result)).toEqual({ ok: true });
    expect(answer.result?.missingWhat).toMatch(/checking was turned off/u);
    expect(answer.result?.rows?.totalRows).toBe(3);
    expect(attempt.scriptRanOut).toBe(false);
  });

  it("always: a passing check is judged too, and the judge confirms it", async () => {
    const attempt = await scriptedAttempt({
      instruction: LIST,
      script: [runNode("read", READ_LOANS, {}, [], { add: true }), complete("Listed.")],
      before: (service) => drivenBy(service, () => ({ judge: "always", check: threeLoans }))
    }, cleanups);
    const answer = answered(attempt);
    expect(judgeCalls(attempt)).toBe(1);
    expect(answer.confirmedBy).toBe("judge");
    expect(answer.result).toMatchObject({ label: "confirmed", timesChecked: 2 });
  });

  it("auto with no check, as empty options: the judge, as the chat has it", async () => {
    const attempt = await scriptedAttempt({
      instruction: LIST,
      script: [runNode("read", READ_LOANS, {}, [], { add: true }), complete("Listed.")],
      before: (service) => drivenBy(service, () => ({}))
    }, cleanups);
    const answer = answered(attempt);
    expect(judgeCalls(attempt)).toBe(1);
    expect(answer.attempt.status).toBe("achieved");
    expect(answer.confirmedBy).toBe("judge");
    expect(answer.attempt.checkingOff).toBeUndefined();
  });
});

describe("a caller's budget and model", () => {
  // Each call is priced at $1.20, so five decisions and a judge cost $7.20: more than the $5 default.
  const pricey = { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 1.2 };
  const resolver = { maxCallsPerRun: 100, maxEstimatedCostUsd: 2 };
  const fiveDecisions = [1, 2, 3, 4].map((page) => runNode(`read.${page}`, READ_LOANS, { page }, [], page === 1 ? { add: true } : {})).concat([complete("Listed.")]);
  const priced = (provider: AutomationStudioLlmProvider): AutomationStudioLlmProvider => ({ ...provider, estimateCostUsd: () => 1.2 });

  it("a raised budget is honoured: the purse opens at it and the attempt spends past $5 to its result", async () => {
    const attempt = await scriptedAttempt({ instruction: LIST, usage: pricey, resolver, wrapProvider: priced, script: fiveDecisions, before: (service) => drivenBy(service, () => ({ budgetUsd: 12 })) }, cleanups);
    const answer = answered(attempt);
    expect(answer.attempt.budget.usd).toBe(12);
    expect(answer.attempt.status).toBe("achieved");
    expect(answer.attempt.spend.usd).toBeGreaterThan(5);
  });

  it("without it, the same attempt is held to $5 and ends budget_out, as the chat's does", async () => {
    const attempt = await scriptedAttempt({ instruction: LIST, usage: pricey, resolver, wrapProvider: priced, script: fiveDecisions }, cleanups);
    const answer = answered(attempt);
    expect(answer.attempt.budget.usd).toBe(5);
    expect(answer.attempt.status).toBe("budget_out");
    expect(answer.attempt.spend.usd).toBeLessThanOrEqual(5);
  });

  it("the model is the caller's for its attempt, and the Flow's otherwise", async () => {
    const models: (string | undefined)[] = [];
    let provider: AutomationStudioLlmProvider | undefined;
    const keep = (made: AutomationStudioLlmProvider) => (provider = made);
    const over = {
      llmProviderResolver: (request: AutomationStudioLlmProviderResolverInput) => {
        models.push(request.modelId);
        return { provider: provider! };
      }
    };
    const script = [runNode("read", READ_LOANS, {}, [], { add: true }), complete("Listed.")];
    await scriptedAttempt({ instruction: LIST, script, wrapProvider: keep, over, before: (service) => drivenBy(service, () => ({ model: "claude-haiku-5-5" })) }, cleanups);
    expect(models.length).toBeGreaterThan(0);
    expect(new Set(models)).toEqual(new Set(["claude-haiku-5-5"]));
    models.splice(0);
    await scriptedAttempt({ instruction: LIST, script, wrapProvider: keep, over }, cleanups);
    expect(new Set(models)).toEqual(new Set([undefined]));
  });
});

describe("a caller's person port and scope", () => {
  it("a person-ask sink hears a permission question and answers it by callback, and the act goes ahead", async () => {
    const raised: { askId: string; kind: string }[] = [];
    // Sending is one of the classes the permission gate asks a person about; a change is not.
    const attempt = await scriptedAttempt({
      instruction: "Renew the card on my library account.",
      script: [runNode("card", RENEW_CARD, {}, ["send_or_publish"], { add: true }), complete("Renewed the card.")],
      before: (service) => drivenBy(service, () => ({
        personAsk: {
          raised: (ask) => { raised.push({ askId: ask.askId, kind: ask.kind }); },
          answer: async (ask) => ({ askId: ask.askId, answeredAt: Date.now(), kind: "grant", value: null, actorId: null })
        }
      }))
    }, cleanups);
    const answer = answered(attempt);
    expect(raised).toEqual([expect.objectContaining({ kind: "permission" })]);
    expect(attempt.library.renewals).toEqual({ card: 1 });
    expect(answer.attempt.status).toBe("achieved");
  });

  it("an act or a site outside the scope is refused unrun and nobody is asked, though the permission gate would let a change through; the rounds find another way to the result", async () => {
    const said: string[] = [];
    const raised: string[] = [];
    const attempt = await scriptedAttempt({
      instruction: LIST,
      // The request permits a change; the scope, which is the grant, does not.
      permittedConsequences: ["modify_existing"],
      script: [
        toolCall("away", LOOK_TOOL, { url: "https://elsewhere.example/loans" }),
        (request) => {
          said.push(evidenceOf(request));
          return runNode("card", RENEW_CARD, {}, ["modify_existing"], { add: true });
        },
        (request) => {
          said.push(evidenceOf(request));
          return runNode("read", READ_LOANS, {}, [], { add: true });
        },
        complete("Listed.")
      ],
      before: (service) => drivenBy(service, () => ({ scope: { permittedConsequences: [], sites: ["library.example"] }, personAsk: { raised: (ask) => { raised.push(ask.kind); } } }))
    }, cleanups);
    const answer = answered(attempt);
    expect(attempt.library.calls.some((call) => JSON.stringify(call.value as JsonObject).includes("elsewhere.example"))).toBe(false);
    expect(said[0]).toContain("answer_first.outside_scope");
    expect(said[0]).toContain("elsewhere.example");
    expect(said[1]).toContain("act this task may not do (modify_existing)");
    expect(attempt.library.calls.some((call) => call.value.node === RENEW_CARD)).toBe(false);
    expect(attempt.library.renewals).toEqual({});
    expect(raised).toEqual([]);
    expect(answer.attempt.status).toBe("achieved");
    expect(answer.result?.rows?.totalRows).toBe(3);
  });
});

describe("a caller's task key", () => {
  it("names the task across other words: a later attempt finds its saved Flow and, with the check passing, replays it with no model call at all", async () => {
    const lane = await laterAttempts(cleanups);
    let options: AutomationStudioAnswerFirstCallerOptions | undefined = { taskKey: "library.loans:spec-1", check: threeLoans };
    drivenBy(lane.service, () => options);
    const first = await lane.attempt({ instruction: LIST, script: [readLoans(), complete("Listed.")] });
    expect(first.answer.attempt).toMatchObject({ status: "achieved", ordinal: 1 });
    expect(first.answer.confirmedBy).toBe("check");
    expect(first.judgeCalls).toHaveLength(0);

    const second = await lane.attempt({ instruction: "Show me all the books I have out." });
    expect(second.asked).toHaveLength(0);
    expect(second.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow", ordinal: 2, taskId: first.answer.attempt.taskId });
    expect(second.answer.attempt.spend.calls).toBe(0);
    expect(second.answer.confirmedBy).toBe("check");
    expect(second.answer.result?.rows?.totalRows).toBe(3);

    // The same other words with no key are another task, with nothing kept.
    options = { check: threeLoans };
    const third = await lane.attempt({ instruction: "Show me all the books I have out.", script: [readLoans(), complete("Listed.")] });
    expect(third.answer.attempt.taskId).not.toBe(first.answer.attempt.taskId);
    expect(third.answer.attempt).toMatchObject({ ordinal: 1, path: "explore" });
  });
});
