// An answer to Core's question: sent flat, with the PIN only when the person
// just re-authorized it, and, for a confirmation Core raised before a delete or
// a payment, running exactly the invocation it carried and nothing else.

import { describe, expect, it, vi } from "vitest";
import { subscribeToAutomationStudioMutations } from "../../../automation-studio/stores";
import { fakeProgramApi } from "../../tests/fake-program-api";

const ran = vi.hoisted(() => [] as Array<Record<string, unknown>>);

vi.mock("../../../automation-studio/conversation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../automation-studio/conversation")>()),
  runConversationCapability: async (_api: unknown, payload: Record<string, unknown>) => {
    ran.push(payload);
    return { capability: null, confidence: 1, arguments: {}, outcome: { status: "done", summary: "Done." } };
  }
}));

const { answerAsk } = await import("../answer-ask");

const invocation = (capabilityId: string, args: Record<string, unknown>) =>
  Buffer.from(JSON.stringify({ capabilityId, arguments: args }), "utf8").toString("base64url");
const confirmation = { kind: "panel-capability", ref: invocation("flow.delete", { flowId: "flow.toaster-2" }) };
const turn = { conversationId: "conversation.1", turnId: "turn.2", attachment: confirmation };
const options = { projectId: () => undefined, onScreen: () => ({ flowId: "flow.kettle-1" }) };

function answering() {
  ran.length = 0;
  const heard: unknown[] = [];
  const stop = subscribeToAutomationStudioMutations((transaction) => heard.push(transaction.mutation), { kinds: ["conversation.changed"] });
  return { api: fakeProgramApi({ "answer-ask": { ok: true, payload: { ask: { askId: "panel-command.1" } } } }), heard, stop };
}

describe("answering a question", () => {
  it("sends the answer flat, with the PIN the person just gave and the project the thread belongs to", async () => {
    const { api, stop } = answering();
    const result = await answerAsk(api, options, { askId: "panel-command.1", kind: "grant", value: undefined, projectId: "project.one", authorizationPin: "1234" });
    stop();
    expect(result).toEqual({ ok: true, value: { ask: { askId: "panel-command.1" } } });
    expect(api.sentTo("answer-ask")).toEqual([{ projectId: "project.one", askId: "panel-command.1", kind: "grant", authorizationPin: "1234" }]);
  });

  it("runs a confirmed delete with the PIN, and exactly the invocation the confirmation carried", async () => {
    const { api, heard, stop } = answering();
    await answerAsk(api, options, { askId: "panel-command.1", kind: "grant", value: undefined, projectId: "project.one", authorizationPin: "1234", turn });
    stop();
    expect(ran).toEqual([{
      conversationId: "conversation.1",
      request: { capabilityId: "flow.delete", arguments: { flowId: "flow.toaster-2" } },
      context: { projectId: "project.one", flowId: "flow.kettle-1", authorizationPin: "1234" }
    }]);
    expect(heard).toEqual([{ kind: "conversation.changed", projectId: "project.one", conversationId: "conversation.1" }]);
  });

  it("runs nothing when the person refuses, and nothing for an ask that carries no invocation", async () => {
    const { api, stop } = answering();
    await answerAsk(api, options, { askId: "panel-command.1", kind: "deny", value: undefined, projectId: "project.one", turn });
    await answerAsk(api, options, { askId: "ask.9", kind: "grant", value: undefined, projectId: "project.one", authorizationPin: "1234", turn: { ...turn, attachment: { kind: "flow-graph-diff", ref: "adaptation:a.1" } } });
    await answerAsk(api, options, { askId: "ask.9", kind: "choice", value: "opt.keep", projectId: "project.one", turn: { conversationId: "conversation.1", turnId: "turn.3" } });
    stop();
    expect(ran).toEqual([]);
    expect(api.sentTo("answer-ask")).toHaveLength(3);
  });

  it("says so, and runs nothing, when the confirmation did not say what to run", async () => {
    const { api, stop } = answering();
    const result = await answerAsk(api, options, { askId: "panel-command.1", kind: "grant", value: undefined, projectId: "project.one", authorizationPin: "1234", turn: { ...turn, attachment: { kind: "panel-capability", ref: "bm90LWpzb24" } } });
    stop();
    expect(ran).toEqual([]);
    expect(result).toEqual({ ok: true, value: { ask: { askId: "panel-command.1" }, problem: "That confirmation did not say what to run, so nothing was done. Ask for it again." } });
  });

  it("answers a refusal as a failure with Core's reason, so the PIN dialog can stay open, and runs nothing", async () => {
    ran.length = 0;
    const api = fakeProgramApi({ "answer-ask": { ok: false, status: 403, requiresRecheck: true, code: "pin_incorrect", error: "That PIN is not right." } });
    const result = await answerAsk(api, options, { askId: "panel-command.1", kind: "grant", value: undefined, projectId: "project.one", authorizationPin: "0000", turn });
    expect(result).toMatchObject({ ok: false, code: "pin_incorrect", sentence: "That PIN is not right." });
    expect(ran).toEqual([]);
  });

  it("falls back to the project of the thread on screen when the answer names none", async () => {
    const { api, stop } = answering();
    await answerAsk(api, { projectId: () => "project.shown" }, { askId: "a1", kind: "text", value: "Use the cheapest.", projectId: undefined });
    stop();
    expect(api.sentTo("answer-ask")).toEqual([{ projectId: "project.shown", askId: "a1", kind: "text", value: "Use the cheapest." }]);
    expect(await answerAsk(api, { projectId: () => undefined }, { askId: "a1", kind: "deny", value: undefined, projectId: undefined })).toMatchObject({ ok: false, code: "no_project" });
  });
});
