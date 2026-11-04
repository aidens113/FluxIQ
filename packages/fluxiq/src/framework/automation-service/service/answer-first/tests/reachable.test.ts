// @fluxiq-test-group real-sql
// That the wiring reaches what the keep-going table asks for, through the real service (t861).
// One probe per seam, not one test per ending: a person's Stop returns normally, a silent
// provider is waited out in place and never on the clock, a stall starts a fresh round from the
// page as it stands, and a permission question has no clock on it and a no goes back to the model.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AutomationStudioLlmTaskRequest } from "../../../../../runtime/llm/index.ts";
import { AutomationStudioLlmProviderError } from "../../../../../runtime/models/failures/index.ts";
import type { AutomationStudioService } from "../../../service.ts";
import { automationStudioAnswerFirstAttemptPorts } from "../index.ts";
import { complete, fakeLibrary, LOOK_TOOL, READ_LOANS, RENEW_CARD, runNode, scriptedAttempt, toolCall } from "./fake-library.ts";

vi.setConfig({ testTimeout: 120_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const decisions = (requests: Awaited<ReturnType<typeof scriptedAttempt>>["requests"]) => requests.filter((request) => request.taskKind === "evidence_tool_decision");

/** The ask the Flow's thread holds, once there is one. */
async function askOf(service: AutomationStudioService, projectId: string, flowId: string): Promise<{ askId: string; timeoutMs: number | null; onTimeout: string | null }> {
  for (let tries = 0; tries < 400; tries += 1) {
    const [conversation] = await service.conversations.listConversations({ projectId, subject: { kind: "flow", id: flowId } });
    const thread = conversation ? await service.conversations.getConversation({ projectId, conversationId: conversation.conversationId }) : null;
    const ask = thread?.turns.find((turn) => turn.ask?.status === "pending")?.ask;
    if (ask) return ask;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("The attempt never asked.");
}

describe("what an attempt's wiring reaches", () => {
  it("a person's Stop is a normal return, with what it had", async () => {
    let service: AutomationStudioService | undefined;
    let ids: { projectId: string; flowId: string } | undefined;
    const attempt = await scriptedAttempt({
      before: (held, project) => {
        service = held;
        ids = project;
      },
      script: [
        runNode("read", READ_LOANS, {}, [], { add: true }),
        () => {
          service!.buildCancellation.cancel(ids!.projectId, ids!.flowId);
          return toolCall("look.after", LOOK_TOOL, { again: true });
        }
      ]
    }, cleanups);
    expect(attempt.answered).toMatchObject({ status: "answered", attempt: { status: "stopped_by_person" }, result: { kind: "rows", label: "unverified" } });
    expect(attempt.answered.status === "answered" ? attempt.answered.result?.rows?.totalRows : 0).toBe(3);
    // Stopped means stopped: no decision was asked after the one that pressed it.
    expect(decisions(attempt.requests)).toHaveLength(2);
  });

  it("a silent provider is waited out in place, by the table's schedule, with the same evidence, and costs nothing", async () => {
    const waits: number[] = [];
    let silences = 2;
    const attempt = await scriptedAttempt({
      before: (service) => { automationStudioAnswerFirstAttemptPorts(service).sleep = async (ms) => { waits.push(ms); }; },
      wrapProvider: (provider) => ({
        ...provider,
        runTask: async (request, execution) => {
          if (request.taskKind === "evidence_tool_decision" && silences > 0) {
            silences -= 1;
            throw new AutomationStudioLlmProviderError("llm.provider_timeout", "No answer.", false);
          }
          return await provider.runTask(request, execution);
        }
      }),
      script: [runNode("read", READ_LOANS, {}, [], { add: true }), complete("Listed.")]
    }, cleanups);
    expect(waits).toEqual([5_000, 10_000]);
    expect(attempt.answered).toMatchObject({ status: "answered", attempt: { status: "achieved" } });
    expect(attempt.library.calls.filter((call) => call.value.node === READ_LOANS)).toHaveLength(1);
  });

  it("an empty balance ends as a budget-out, with what it had", async () => {
    let answered = 0;
    const attempt = await scriptedAttempt({
      wrapProvider: (provider) => ({
        ...provider,
        runTask: async (request, execution) => {
          if (request.taskKind === "evidence_tool_decision" && (answered += 1) === 2) throw new AutomationStudioLlmProviderError("llm.provider_balance_exhausted", "No balance.", false);
          return await provider.runTask(request, execution);
        }
      }),
      script: [runNode("read", READ_LOANS, {}, [], { add: true }), complete("Listed.")]
    }, cleanups);
    expect(attempt.answered).toMatchObject({ status: "answered", attempt: { status: "budget_out" }, result: { kind: "rows", label: "unverified" } });
  });

  it("a stall starts a fresh round: same act record, the page as it stands, told what landed, and no second act", async () => {
    const library = fakeLibrary();
    const judged = { response: { kind: "diagnosis", summary: "Judged.", diagnosis: { answersRequest: "no", observed: "Not yet.", defects: [{ kind: "other", row: "card", requestWords: "renew" }] } }, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0.0001 } };
    let fresh: string | undefined;
    let pressedAgain = false;
    const decide = (request: AutomationStudioLlmTaskRequest) => {
      const note = request.context.evidenceLoop?.evidence.find((entry) => entry.toolId === "core.attempt_note");
      if (!note) return complete("I have it.");
      fresh ??= JSON.stringify(note.value);
      // A fresh round tries the act again, and the record refuses it; then the page has moved, and that is new evidence.
      if (!pressedAgain) {
        pressedAgain = true;
        return runNode("card.again", RENEW_CARD, {}, ["modify_existing"], { add: true });
      }
      library.shelf = "moved";
      return complete("I have it now.");
    };
    const attempt = await scriptedAttempt({
      library,
      instruction: "Renew the card and list every loan.",
      permittedConsequences: ["modify_existing"],
      resolver: { maxCallsPerRun: 12 },
      judge: [judged],
      before: (service) => { automationStudioAnswerFirstAttemptPorts(service).sleep = async () => undefined; },
      script: [runNode("read", READ_LOANS, {}, [], { add: true }), runNode("card", RENEW_CARD, {}, ["modify_existing"], { add: true }), ...Array.from({ length: 40 }, () => decide)]
    }, cleanups);
    expect(fresh).toContain("carriedOver");
    expect(fresh).toContain("acts");
    expect(library.renewals.card).toBe(1);
    expect(library.calls.filter((call) => call.value.replay === "reset")).toEqual([]);
    expect(attempt.answered).toMatchObject({ status: "answered", attempt: { status: "achieved" } });
    if (attempt.answered.status === "answered") expect(attempt.answered.result?.acts).toHaveLength(1);
  });

  it("a permission question has no clock on it, an allow continues in place, and a no reaches the model as declined", async () => {
    let service: AutomationStudioService | undefined;
    let ids: { projectId: string; flowId: string } | undefined;
    const seen: string[] = [];
    const generation = scriptedAttempt({
      instruction: "Renew the card on my library account.",
      before: (held, project) => {
        service = held;
        ids = project;
      },
      script: [
        runNode("card", RENEW_CARD, {}, ["send_or_publish"], { add: true }),
        (request) => {
          seen.push(JSON.stringify(request.context.evidenceLoop?.evidence));
          return complete("Renewed the card.");
        }
      ]
    }, cleanups);
    while (!service) await new Promise((resolve) => setTimeout(resolve, 25));
    const ask = await askOf(service, ids!.projectId, ids!.flowId);
    expect(ask.timeoutMs).toBeNull();
    expect(ask.onTimeout).toBeNull();
    await service.conversations.answerAsk({ projectId: ids!.projectId, askId: ask.askId, kind: "grant" });
    const attempt = await generation;
    expect(attempt.library.renewals).toEqual({ card: 1 });
    expect(attempt.answered).toMatchObject({ status: "answered", attempt: { status: "achieved" }, result: { kind: "done_on_site" } });
    expect(seen[0]).toContain("actedOn");

    let declinedService: AutomationStudioService | undefined;
    let declinedIds: { projectId: string; flowId: string } | undefined;
    const declined: string[] = [];
    const generating = scriptedAttempt({
      instruction: "Renew the card on my library account.",
      before: (held, project) => {
        declinedService = held;
        declinedIds = project;
      },
      script: [
        runNode("card", RENEW_CARD, {}, ["send_or_publish"], { add: true }),
        (request) => {
          declined.push(JSON.stringify(request.context.evidenceLoop?.evidence));
          return runNode("read", READ_LOANS, {}, [], { add: true });
        },
        complete("I could not renew it, so here are the loans.")
      ]
    }, cleanups);
    while (!declinedService) await new Promise((resolve) => setTimeout(resolve, 25));
    const refused = await askOf(declinedService, declinedIds!.projectId, declinedIds!.flowId);
    await declinedService.conversations.answerAsk({ projectId: declinedIds!.projectId, askId: refused.askId, kind: "deny" });
    const after = await generating;
    expect(after.library.renewals).toEqual({});
    expect(declined[0]).toContain("\"declined\":true");
    expect(after.answered).toMatchObject({ status: "answered", attempt: { status: "achieved" } });
  });
});
