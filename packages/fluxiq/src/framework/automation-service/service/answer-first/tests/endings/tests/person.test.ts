// @fluxiq-test-group real-sql
// The keep-going table's rows about a person: a permission allowed or declined, a check only a
// person can clear, the attempt asking because it is stuck, and a Stop. Nothing here has a clock.
// A person's Stop always wins, and it comes back as a normal return with what the attempt had.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_PERSON_NEEDED_CONTROL_KIND, AUTOMATION_STUDIO_PERSON_NEEDED_DONE_OPTION, AUTOMATION_STUDIO_PERSON_NEEDED_STOP_OPTION } from "../../../../../../../runtime/automation-parking/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult, AutomationStudioLlmTaskRequest } from "../../../../../../../runtime/llm/index.ts";
import { AutomationStudioLlmProviderError } from "../../../../../../../runtime/models/failures/index.ts";
import type { AutomationStudioService } from "../../../../../service.ts";
import { automationStudioAnswerFirstAttemptPorts } from "../../../index.ts";
import { complete, LOOK_TOOL, READ_LOANS, RENEW_CARD, runNode, scriptedAttempt, toolCall } from "../../fake-library.ts";
import { answerOf, decisions, expectEnded, expectPresses, expectReached, held, keptAttempt, noWaiting, pendingAsk } from "../support.ts";

vi.setConfig({ testTimeout: 180_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const check = (call: { value: JsonObject }): AutomationStudioLlmEvidenceToolExecutionResult => ({
  kind: "llm_evidence_tool_execution", evidence: { ok: false, code: "needs_person" }, effectApplied: false, personNeeded: true,
  draft: { actionId: String(call.value.node), input: call.value, effect: "observe", proposes: true, ranWith: { node: String(call.value.node), parameters: {} } }
});

describe("a permission", () => {
  it("allowed continues in place, with no clock on the question", async () => {
    const hold = held();
    const seen: string[] = [];
    const generating = scriptedAttempt({
      instruction: "Renew the card on my library account.",
      before: hold.before,
      script: [
        runNode("card", RENEW_CARD, {}, ["send_or_publish"], { add: true }),
        (request) => {
          seen.push(JSON.stringify(request.context.evidenceLoop?.evidence));
          return complete("Renewed the card.");
        }
      ]
    }, cleanups);
    const { service, projectId, flowId } = await hold.ready();
    const ask = await pendingAsk(service, projectId, flowId);
    expect(ask.timeoutMs).toBeNull();
    expect(ask.onTimeout).toBeNull();
    // The row is written just after the question shows, so it is waited for rather than read once.
    await vi.waitFor(async () => expect((await keptAttempt(service, projectId, flowId))?.attempt).toMatchObject({ status: "waiting_for_person", waitingFor: "permission" }), { timeout: 10_000, interval: 25 });
    await service.conversations.answerAsk({ projectId, askId: ask.askId, kind: "grant" });
    const attempt = await generating;
    const answer = expectReached(attempt);
    expect(answer.result).toMatchObject({ kind: "done_on_site" });
    expectPresses(attempt, { card: 1 });
    expect(seen[0]).toContain("actedOn");
  });

  it("declined looks for another way, and reaches the result without that act", async () => {
    const hold = held();
    const declined: string[] = [];
    const generating = scriptedAttempt({
      instruction: "List every loan on my library account, renewing the card if you can.",
      before: hold.before,
      script: [
        runNode("card", RENEW_CARD, {}, ["send_or_publish"], { add: true }),
        (request) => {
          declined.push(JSON.stringify(request.context.evidenceLoop?.evidence));
          return runNode("read", READ_LOANS, {}, [], { add: true });
        },
        complete("I did not renew the card, and here are the loans.")
      ]
    }, cleanups);
    const { service, projectId, flowId } = await hold.ready();
    const ask = await pendingAsk(service, projectId, flowId);
    await service.conversations.answerAsk({ projectId, askId: ask.askId, kind: "deny" });
    const attempt = await generating;
    expect(declined[0]).toContain("\"declined\":true");
    const answer = expectReached(attempt);
    expect(answer.result?.rows?.totalRows).toBe(3);
    expect(answer.result?.acts).toEqual([]);
    expectPresses(attempt, {});
  });
});

describe("a model key that locks during an attempt", () => {
  it("shows that it waits on the attempt, and carries on by itself once unlocked", async () => {
    const hold = held();
    const listeners = new Set<(state: "started" | "ended", heldMs: number) => void>();
    let unlock = () => {};
    const unlocked = new Promise<void>((resolve) => { unlock = resolve; });
    let waits = 1;
    const generating = scriptedAttempt({
      before: hold.before,
      wrapProvider: (provider) => ({
        ...provider,
        observeHolds: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        whenReady: async () => {
          if (waits-- <= 0) return;
          listeners.forEach((listener) => listener("started", 0));
          await unlocked;
          listeners.forEach((listener) => listener("ended", 5));
        }
      }),
      script: [runNode("read", READ_LOANS, {}, [], { add: true }), complete("Listed.")]
    }, cleanups);
    const { service, projectId, flowId } = await hold.ready();
    await vi.waitFor(async () => expect((await keptAttempt(service, projectId, flowId))?.attempt).toMatchObject({ status: "waiting_for_person", waitingFor: "model_key_locked" }), { timeout: 20_000, interval: 50 });
    unlock();
    const attempt = await generating;
    expect(expectReached(attempt).result?.rows?.totalRows).toBe(3);
    expect((await keptAttempt(service, projectId, flowId))?.attempt.status).toBe("achieved");
  });
});

describe("a check only a person can clear", () => {
  it("waits for the person with no clock, and continues when they clear it", async () => {
    const hold = held();
    let checks = 1;
    const generating = scriptedAttempt({
      before: hold.before,
      fault: (call) => call.value.node === READ_LOANS && checks-- > 0 ? check(call) : undefined,
      script: [runNode("read.checked", READ_LOANS, {}, [], { add: true }), runNode("read", READ_LOANS, { again: true }, [], {}), complete("Listed.")]
    }, cleanups);
    const { service, projectId, flowId } = await hold.ready();
    const ask = await pendingAsk(service, projectId, flowId, AUTOMATION_STUDIO_PERSON_NEEDED_CONTROL_KIND);
    expect(ask.timeoutMs).toBeNull();
    // The row is written just after the question shows, so it is waited for rather than read once.
    await vi.waitFor(async () => expect((await keptAttempt(service, projectId, flowId))?.attempt).toMatchObject({ status: "waiting_for_person", waitingFor: "person_only_check" }), { timeout: 10_000, interval: 25 });
    await service.conversations.answerAsk({ projectId, askId: ask.askId, kind: "choice", value: AUTOMATION_STUDIO_PERSON_NEEDED_DONE_OPTION });
    const attempt = await generating;
    const answer = expectReached(attempt);
    expect(answer.result?.rows?.totalRows).toBe(3);
    // The next decision sees the page as it is after the check, as its current view: the fresh look the cleared call
    // stands with, never the page from before it (scripted pair run-mwa3kh87-d34c2f04 read a gone page's handles).
    const next = decisions(attempt)[1]!.context.evidenceLoop?.evidence ?? [];
    const view = next.find((entry) => entry.toolId === "core.current_view")?.value as { groups?: { group: string; callId: string }[] } | undefined;
    expect(view?.groups?.find((group) => group.group === "top")?.callId).toBe("read.checked");
  });

  it("pauses at every fresh check the person clears, however many, and the same round goes on from each (run-mwa19obz-abd5d558)", async () => {
    // The site put a new check in front of every few loads. The fourth in one round was never put to the person:
    // the round threw, the check stayed on the page, and the next round started over from there.
    const hold = held();
    const checked = new Set<number>();
    const reads = [1, 2, 3, 4, 5];
    const generating = scriptedAttempt({
      before: hold.before,
      fault: (call) => {
        const page = (call.value.parameters as JsonObject | undefined)?.page;
        if (call.value.node !== READ_LOANS || typeof page !== "number" || checked.has(page)) return undefined;
        checked.add(page);
        return check(call);
      },
      // Each checked call stands as the domain described it once cleared, with nothing read; the last read reads the list.
      script: [...reads.map((page) => runNode(`read.${page}`, READ_LOANS, { page }, [], page === 1 ? { add: true } : {})), runNode("read.all", READ_LOANS, { all: true }, [], {}), complete("Listed.")]
    }, cleanups);
    const { service, projectId, flowId } = await hold.ready();
    let finished = false;
    const settled = generating.finally(() => { finished = true; });
    const answered: string[] = [];
    while (!finished) {
      const [conversation] = await service.conversations.listConversations({ projectId, subject: { kind: "flow", id: flowId } });
      const thread = conversation ? await service.conversations.getConversation({ projectId, conversationId: conversation.conversationId }) : null;
      const ask = thread?.turns.map((turn) => turn.ask).find((each) => each?.status === "pending" && each.control?.kind === AUTOMATION_STUDIO_PERSON_NEEDED_CONTROL_KIND && !answered.includes(each.askId));
      if (ask) {
        answered.push(ask.askId);
        await service.conversations.answerAsk({ projectId, askId: ask.askId, kind: "choice", value: AUTOMATION_STUDIO_PERSON_NEEDED_DONE_OPTION });
      } else {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
    const attempt = await settled;
    // Every check was put to the person, the fourth and fifth included.
    expect(answered).toHaveLength(reads.length);
    expect(expectReached(attempt).result?.rows?.totalRows).toBe(3);
    // One decision per step and one to complete: no step was asked for twice, and nothing started over.
    expect(decisions(attempt)).toHaveLength(reads.length + 2);
  });

  it("its Stop ends the task as a person's Stop, with what it had", async () => {
    const hold = held();
    let checks = 1;
    const generating = scriptedAttempt({
      before: hold.before,
      fault: (call) => (call.value.parameters as JsonObject | undefined)?.second === true && checks-- > 0 ? check(call) : undefined,
      script: [runNode("read", READ_LOANS, {}, [], { add: true }), runNode("read.checked", READ_LOANS, { second: true }, [], {}), complete("Listed.")]
    }, cleanups);
    const { service, projectId, flowId } = await hold.ready();
    const ask = await pendingAsk(service, projectId, flowId, AUTOMATION_STUDIO_PERSON_NEEDED_CONTROL_KIND);
    await service.conversations.answerAsk({ projectId, askId: ask.askId, kind: "choice", value: AUTOMATION_STUDIO_PERSON_NEEDED_STOP_OPTION });
    const attempt = await generating;
    const answer = expectEnded(attempt, "stopped_by_person");
    expect(answer.result).toMatchObject({ kind: "rows", label: "unverified" });
    expect(answer.result?.rows?.totalRows).toBe(3);
  });
});

describe("a check with nobody to ask", () => {
  it("stays waiting for a person, honestly, with what it has, and spends no more", async () => {
    let checks = 1;
    const attempt = await scriptedAttempt({
      before: (service) => { Object.defineProperty(service.conversations, "available", { value: false }); },
      fault: (call) => (call.value.parameters as JsonObject | undefined)?.second === true && checks-- > 0 ? check(call) : undefined,
      script: [runNode("read", READ_LOANS, {}, [], { add: true }), runNode("read.checked", READ_LOANS, { second: true }, [], {}), complete("Never asked.")]
    }, cleanups);
    expect(attempt.hung).toBe(false);
    expect(attempt.scriptRanOut).toBe(false);
    const answer = attempt.answered.status === "answered" ? attempt.answered : undefined;
    expect(answer?.attempt).toMatchObject({ status: "waiting_for_person", waitingFor: "person_only_check" });
    expect(answer?.attempt.endedAtMs).toBeUndefined();
    expect(answer?.result?.rows?.totalRows).toBe(3);
    expect(decisions(attempt)).toHaveLength(2);
  });
});

describe("an attempt stuck in a loop", () => {
  const stuckScript = (answered: () => boolean) => {
    const decide = (request: AutomationStudioLlmTaskRequest) => {
      if (!answered()) return runNode("read.stuck", READ_LOANS, { from: "the wrong list" }, [], {});
      const done = request.context.evidenceLoop?.evidence.some((entry) => JSON.stringify(entry.value).includes("Atlas of Rivers"));
      return done ? complete("Listed.") : runNode("read", READ_LOANS, {}, [], { add: true });
    };
    return Array.from({ length: 200 }, () => decide);
  };
  const failing = (call: { value: JsonObject }): AutomationStudioLlmEvidenceToolExecutionResult | undefined => (call.value.parameters as JsonObject | undefined)?.from === "the wrong list" ? { kind: "llm_evidence_tool_execution", evidence: { ok: false, code: "target_not_found" }, effectApplied: false, resultCode: "web.action.rejected.target_not_found", failure: { category: "target_not_found", code: "web.target.not_found", retryable: false, stage: "dispatch" } } : undefined;

  it("asks the person after two fresh approaches, stops spending, keeps what it has, and resumes on the same record", async () => {
    const hold = held();
    let keepGoing = false;
    let modelCalls = 0;
    const generating = scriptedAttempt({
      before: (service, project) => {
        noWaiting()(service);
        hold.before(service, project);
      },
      wrapProvider: (provider) => ({
        ...provider,
        runTask: async (request, execution) => {
          modelCalls += 1;
          return await provider.runTask(request, execution);
        }
      }),
      fault: failing,
      script: stuckScript(() => keepGoing)
    }, cleanups);
    const { service, projectId, flowId } = await hold.ready();
    const ask = await pendingAsk(service, projectId, flowId, "stuck_in_a_loop");
    expect(ask.timeoutMs).toBeNull();
    const kept = await keptAttempt(service, projectId, flowId);
    expect(kept?.attempt).toMatchObject({ status: "waiting_for_person", waitingFor: "stuck_in_a_loop" });
    expect(kept?.tried.approaches).toBe(2);
    // Nothing is asked of the model while it waits.
    const callsAtTheAsk = modelCalls;
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(modelCalls).toBe(callsAtTheAsk);
    keepGoing = true;
    await service.conversations.answerAsk({ projectId, askId: ask.askId, kind: "choice", value: "stuck_keep_going" });
    const attempt = await generating;
    const answer = expectReached(attempt);
    expect(answer.result?.rows?.totalRows).toBe(3);
    const caught = Object.values(answer.attempt.loopsCaught);
    expect(caught.reduce((sum, each) => sum + each.changeApproach, 0)).toBe(2);
    expect(caught.reduce((sum, each) => sum + each.askPerson, 0)).toBe(1);
    expect((await keptAttempt(service, projectId, flowId))?.tried.approaches).toBe(2);
  });

  it("with nobody to ask it waits for a person, with the reason, and spends nothing more", async () => {
    const attempt = await scriptedAttempt({
      before: (service) => {
        noWaiting()(service);
        Object.defineProperty(service.conversations, "available", { value: false });
      },
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.02 },
      resolver: { maxTotalEstimatedCostUsd: 0.8 },
      wrapProvider: (provider) => ({ ...provider, estimateCostUsd: () => 0.02 }),
      keepLooking: true,
      fault: failing,
      script: stuckScript(() => false)
    }, cleanups);
    expect(attempt.hung).toBe(false);
    const answer = answerOf(attempt);
    expect(answer.attempt).toMatchObject({ status: "waiting_for_person", waitingFor: "stuck_in_a_loop" });
    expect(Object.values(answer.attempt.loopsCaught).reduce((sum, each) => sum + each.askPerson, 0)).toBeGreaterThanOrEqual(1);
    expect(answer.attempt.spend.usd).toBeLessThan(0.8);
  });

  it("the person's Stop at that question ends it, with what it had", async () => {
    const hold = held();
    const generating = scriptedAttempt({
      before: (service, project) => {
        noWaiting()(service);
        hold.before(service, project);
      },
      fault: failing,
      script: stuckScript(() => false)
    }, cleanups);
    const { service, projectId, flowId } = await hold.ready();
    const ask = await pendingAsk(service, projectId, flowId, "stuck_in_a_loop");
    await service.conversations.answerAsk({ projectId, askId: ask.askId, kind: "choice", value: "stuck_stop" });
    const attempt = await generating;
    expectEnded(attempt, "stopped_by_person");
  });
});

describe("a person's Stop", () => {
  it("mid-round is a normal return with what it had, and asks nothing more", async () => {
    const hold = held();
    const attempt = await scriptedAttempt({
      before: hold.before,
      script: [
        runNode("read", READ_LOANS, {}, [], { add: true }),
        () => {
          void hold.ready().then(({ service, projectId, flowId }) => service.buildCancellation.cancel(projectId, flowId));
          return toolCall("look.after", LOOK_TOOL, { again: true });
        },
        complete("Never asked.")
      ]
    }, cleanups);
    const answer = expectEnded(attempt, "stopped_by_person");
    expect(answer.result).toMatchObject({ kind: "rows", label: "unverified" });
    expect(answer.result?.missingWhat).toMatch(/stopped/iu);
    expect(answer.attempt.spend.usd).toBeGreaterThan(0);
    expect(decisions(attempt).length).toBeLessThanOrEqual(3);
  });

  it("during a permission wait wins over the question", async () => {
    const hold = held();
    const generating = scriptedAttempt({
      instruction: "Renew the card on my library account.",
      before: hold.before,
      script: [runNode("card", RENEW_CARD, {}, ["send_or_publish"], { add: true }), complete("Never asked.")]
    }, cleanups);
    const { service, projectId, flowId } = await hold.ready();
    await pendingAsk(service, projectId, flowId);
    service.buildCancellation.cancel(projectId, flowId);
    const attempt = await generating;
    expectEnded(attempt, "stopped_by_person");
    expectPresses(attempt, {});
  });

  it("during a check's wait wins over the check", async () => {
    const hold = held();
    const generating = scriptedAttempt({
      before: hold.before,
      fault: (call) => call.value.node === READ_LOANS ? check(call) : undefined,
      script: [runNode("read.checked", READ_LOANS, {}, [], { add: true }), complete("Never asked.")]
    }, cleanups);
    const { service, projectId, flowId } = await hold.ready();
    await pendingAsk(service, projectId, flowId, AUTOMATION_STUDIO_PERSON_NEEDED_CONTROL_KIND);
    service.buildCancellation.cancel(projectId, flowId);
    expectEnded(await generating, "stopped_by_person");
  });

  it("during a wait for a silent provider wakes it, and nothing more is asked", async () => {
    const hold = held();
    let waiting = false;
    const generating = scriptedAttempt({
      before: (service: AutomationStudioService, project) => {
        hold.before(service, project);
        automationStudioAnswerFirstAttemptPorts(service).sleep = async (_ms, signal) => {
          waiting = true;
          await new Promise<void>((resolve) => {
            if (signal?.aborted) resolve();
            signal?.addEventListener("abort", () => resolve(), { once: true });
          });
        };
      },
      wrapProvider: (provider) => ({
        ...provider,
        runTask: async (request, execution) => {
          if (request.taskKind === "evidence_tool_decision") throw new AutomationStudioLlmProviderError("llm.provider_timeout", "No answer.", false);
          return await provider.runTask(request, execution);
        }
      }),
      script: [complete("Never asked.")]
    }, cleanups);
    const { service, projectId, flowId } = await hold.ready();
    while (!waiting) await new Promise((resolve) => setTimeout(resolve, 25));
    service.buildCancellation.cancel(projectId, flowId);
    const attempt = await generating;
    const answer = expectEnded(attempt, "stopped_by_person");
    expect(answer.attempt.spend.usd).toBe(0);
  });
});
