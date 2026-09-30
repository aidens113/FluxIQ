// Conversation commands run against a real thread, with the registry faked at
// the port. What is pinned: each command makes the calls the panel makes, in
// order, with the session and the page it was given; long ones answer
// `started` and write their result later as a `panel-capability-result` turn;
// a failure says why and how far it got; the work's own questions and
// activity land in the chat thread; an improvement asks before it applies, and
// a yes applies exactly the change it asked about.

import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { automationStudioActivityHub, emitAutomationStudioActivity, runWithAutomationStudioActivity } from "../../../activity/index.ts";
import { AutomationStudioProjectDatabasePool } from "../../../../storage/index.ts";
import { AutomationStudioConversations } from "../../conversations.ts";
import { AUTOMATION_STUDIO_PANEL_CAPABILITY_RESULT_ATTACHMENT } from "../../instructions/index.ts";
import type { AutomationStudioConversationCommandCallResult, AutomationStudioConversationCommandContext } from "../command.ts";
import { AUTOMATION_STUDIO_CONVERSATION_COMMANDS } from "../catalog.ts";
import { AUTOMATION_STUDIO_CONVERSATION_COMMAND_ASK_PREFIX, AUTOMATION_STUDIO_CONVERSATION_COMMAND_ATTACHMENT } from "../confirmation.ts";
import { runConfirmedAutomationStudioConversationCommand } from "../confirmed.ts";
import { executeAutomationStudioConversationCommand } from "../execute.ts";
import { automationStudioConversationCommandWork } from "../work.ts";

const rootDir = path.join(process.cwd(), ".tmp", "automation-studio-conversation-commands-test");
const PROJECT = "project.commands";
const PAGE = "https://shop.example/kettles?q=blue&token=secret#top";

type Handler = (payload: Record<string, unknown>) => AutomationStudioConversationCommandCallResult | Promise<AutomationStudioConversationCommandCallResult>;

let pool: AutomationStudioProjectDatabasePool | undefined;

function openConversations(): AutomationStudioConversations {
  pool = new AutomationStudioProjectDatabasePool({ rootDir });
  return new AutomationStudioConversations(pool);
}

function fakePort(handlers: Record<string, Handler>) {
  const calls: Array<{ endpoint: string; payload: Record<string, unknown> }> = [];
  return {
    calls,
    port: {
      async call(endpoint: string, payload: Record<string, unknown>): Promise<AutomationStudioConversationCommandCallResult> {
        calls.push({ endpoint, payload });
        const handler = handlers[endpoint];
        return handler ? handler(payload) : { ok: false, error: `No fake for ${endpoint}.` };
      }
    }
  };
}

async function chat(conversations: AutomationStudioConversations): Promise<string> {
  const thread = await conversations.openConversation({ projectId: PROJECT, subject: { kind: "project", id: PROJECT }, title: null, conversationId: "conversation.chat" });
  return thread.conversationId;
}

function contextFor(conversations: AutomationStudioConversations, conversationId: string, port: AutomationStudioConversationCommandContext["port"], extra: Partial<AutomationStudioConversationCommandContext> = {}): AutomationStudioConversationCommandContext {
  return { port, host: conversations, projectId: PROJECT, conversationId, sessionId: "session.person", keyLocked: false, startLocation: PAGE, ...extra };
}

async function turnsOf(conversations: AutomationStudioConversations, conversationId: string) {
  return (await conversations.getConversation({ projectId: PROJECT, conversationId }))?.turns ?? [];
}

const command = (id: string) => {
  const found = AUTOMATION_STUDIO_CONVERSATION_COMMANDS.get(id);
  if (!found) throw new Error(`No command ${id}`);
  return found;
};

const BUILD_OK: Handler = () => ({ ok: true, payload: { adaptation: { adaptationId: "adaptation.1", status: "proposed" } } });
const REVIEW_OK: Handler = (payload) => ({ ok: true, payload: { adaptation: { adaptationId: payload.adaptationId, status: payload.action === "apply" ? "applied" : "validated" } } });

describe("conversation commands", () => {
  beforeEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
    await mkdir(rootDir, { recursive: true });
  });

  afterEach(async () => {
    await automationStudioConversationCommandWork.idle();
    automationStudioConversationCommandWork.takeUnreported();
    if (pool) {
      await pool.closeAll();
      pool = undefined;
    }
    await rm(rootDir, { recursive: true, force: true });
  });

  it("creates a Flow here in the background: create, save, explore from the page, approve and apply", async () => {
    const conversations = openConversations();
    const conversationId = await chat(conversations);
    const { port, calls } = fakePort({
      "create-flow": () => ({ ok: true, payload: { flow: { flowId: "flow.kettle" } } }),
      "save-flow-generation-instruction": () => ({ ok: true, payload: { instruction: { instructionId: "instruction.1" } } }),
      "generate-flow-bootstrap-adaptation": BUILD_OK,
      "review-flow-adaptation": REVIEW_OK
    });

    const execution = await executeAutomationStudioConversationCommand({
      command: command("flow.createHere"),
      context: contextFor(conversations, conversationId, port),
      arguments: { instruction: "Find the cheapest blue kettle. Then tell me its price." }
    });
    expect(execution).toMatchObject({ capabilityId: "flow.createHere", status: "started" });
    await automationStudioConversationCommandWork.idle();

    expect(calls).toEqual([
      { endpoint: "create-flow", payload: { projectId: PROJECT, name: "Find the cheapest blue kettle." } },
      { endpoint: "save-flow-generation-instruction", payload: { projectId: PROJECT, flowId: "flow.kettle", authSessionId: "session.person", instruction: "Find the cheapest blue kettle. Then tell me its price." } },
      { endpoint: "generate-flow-bootstrap-adaptation", payload: { projectId: PROJECT, flowId: "flow.kettle", authSessionId: "session.person", evidenceGuided: true, startLocation: PAGE } },
      { endpoint: "review-flow-adaptation", payload: { projectId: PROJECT, flowId: "flow.kettle", adaptationId: "adaptation.1", action: "approve" } },
      { endpoint: "review-flow-adaptation", payload: { projectId: PROJECT, flowId: "flow.kettle", adaptationId: "adaptation.1", action: "apply" } }
    ]);
    const [result] = await turnsOf(conversations, conversationId);
    expect(result?.author).toBe("automation");
    expect(result?.attachment).toEqual({ kind: AUTOMATION_STUDIO_PANEL_CAPABILITY_RESULT_ATTACHMENT, ref: "flow.createHere" });
    // The page is named by origin and path; its query and fragment stay out of the thread.
    expect(result?.text).toContain('Created the Flow "Find the cheapest blue kettle."');
    expect(result?.text).toContain("https://shop.example/kettles");
    expect(result?.text).not.toContain("token=secret");
  });

  it("says why a build stopped and how far it had got, and applies nothing", async () => {
    const conversations = openConversations();
    const conversationId = await chat(conversations);
    const { port, calls } = fakePort({
      "create-flow": () => ({ ok: true, payload: { flow: { flowId: "flow.kettle" } } }),
      "save-flow-generation-instruction": () => ({ ok: true }),
      "generate-flow-bootstrap-adaptation": () => ({ ok: false, error: "Flow Bootstrap generation failed (flow_bootstrap.provider_refused).", payload: { diagnostic: { code: "flow_bootstrap.provider_refused", stage: "provider" } } })
    });

    await executeAutomationStudioConversationCommand({ command: command("flow.createHere"), context: contextFor(conversations, conversationId, port, { keyLocked: true }), arguments: { instruction: "Watch kettle prices", name: "Kettles" } });
    await automationStudioConversationCommandWork.idle();

    expect(calls.map((call) => call.endpoint)).not.toContain("review-flow-adaptation");
    const [result] = await turnsOf(conversations, conversationId);
    expect(result?.text).toContain('"Create an automation here" stopped because the build failed: Flow Bootstrap generation failed (flow_bootstrap.provider_refused) (provider: flow_bootstrap.provider_refused)');
    expect(result?.text).toContain('Before that I created the Flow "Kettles" and saved what it should do.');
    expect(result?.text).toContain("Your model key is locked");
  });

  it("routes the work's own questions and activity into the chat thread", async () => {
    const conversations = openConversations();
    const conversationId = await chat(conversations);
    const seen: ClientGatewayActivity[] = [];
    const unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
    const { port } = fakePort({
      "create-flow": () => ({ ok: true, payload: { flow: { flowId: "flow.kettle" } } }),
      "save-flow-generation-instruction": () => ({ ok: true }),
      // What a build does when it has a question: open the Flow's thread by
      // subject, with no id, and say something in it.
      "generate-flow-bootstrap-adaptation": async () => {
        await conversations.writerFor({ projectId: PROJECT, subject: { kind: "flow", id: "flow.kettle" } }).say("May I press Subscribe?");
        await runWithAutomationStudioActivity({ kind: "build", id: "build.1", projectId: PROJECT, flowId: "flow.kettle" }, async () => {
          emitAutomationStudioActivity({ phase: "thinking", label: "Looking at the page" });
        });
        return BUILD_OK({});
      },
      "review-flow-adaptation": REVIEW_OK
    });
    try {
      await executeAutomationStudioConversationCommand({ command: command("flow.createHere"), context: contextFor(conversations, conversationId, port), arguments: { instruction: "Subscribe me" } });
      await automationStudioConversationCommandWork.idle();
    } finally {
      unsubscribe();
    }

    const turns = await turnsOf(conversations, conversationId);
    expect(turns.map((turn) => turn.text)).toContain("May I press Subscribe?");
    expect(await conversations.listConversations({ projectId: PROJECT })).toHaveLength(1);
    expect(seen.find((event) => event.label === "Looking at the page")?.conversationId).toBe(conversationId);
    // Outside the command, the same code opens the Flow's own thread as before.
    const outside = await conversations.writerFor({ projectId: PROJECT, subject: { kind: "flow", id: "flow.kettle" } }).say("Later.");
    expect(outside.conversationId).not.toBe(conversationId);
  });

  it("improves a Flow, then asks before applying, and a yes applies exactly that change", async () => {
    const conversations = openConversations();
    const conversationId = await chat(conversations);
    const { port, calls } = fakePort({
      "save-flow-instruction": () => ({ ok: true }),
      "generate-flow-bootstrap-adaptation": () => ({ ok: true, payload: { adaptation: { adaptationId: "adaptation.extend", status: "proposed" } } }),
      "review-flow-adaptation": REVIEW_OK
    });
    const context = contextFor(conversations, conversationId, port);

    await executeAutomationStudioConversationCommand({ command: command("flow.improve"), context, arguments: { flowId: "flow.kettle", change: "Also check the second page of results." } });
    await automationStudioConversationCommandWork.idle();

    expect(calls[0]).toEqual({
      endpoint: "save-flow-instruction",
      payload: { projectId: PROJECT, flowId: "flow.kettle", title: "Improvement: Also check the second page of results.", body: "Also check the second page of results.", requirement: "required", tags: ["generation"] }
    });
    // An extend starts where the Flow already starts, not from the page on screen.
    expect(calls[1]).toEqual({ endpoint: "generate-flow-bootstrap-adaptation", payload: { projectId: PROJECT, flowId: "flow.kettle", authSessionId: "session.person", evidenceGuided: true, mode: "extend" } });
    expect(calls.map((call) => call.endpoint)).not.toContain("review-flow-adaptation");

    const [result, question] = await turnsOf(conversations, conversationId);
    expect(result?.attachment).toEqual({ kind: AUTOMATION_STUDIO_PANEL_CAPABILITY_RESULT_ATTACHMENT, ref: "flow.improve" });
    expect(question?.ask).toMatchObject({ kind: "confirm", parks: false, status: "pending", consequences: ["modify_existing"] });
    expect(question?.ask?.askId.startsWith(AUTOMATION_STUDIO_CONVERSATION_COMMAND_ASK_PREFIX)).toBe(true);
    expect(question?.attachment?.kind).toBe(AUTOMATION_STUDIO_CONVERSATION_COMMAND_ATTACHMENT);
    expect(JSON.parse(Buffer.from(question!.attachment!.ref, "base64url").toString("utf8"))).toEqual({ capabilityId: "adaptation.apply", arguments: { flowId: "flow.kettle", adaptationId: "adaptation.extend" } });

    const answered = await conversations.answerAsk({ projectId: PROJECT, askId: question!.ask!.askId, kind: "grant" });
    const execution = await runConfirmedAutomationStudioConversationCommand({ ask: answered, attachment: question!.attachment, context });
    expect(execution).toMatchObject({ capabilityId: "adaptation.apply", status: "done", adaptationId: "adaptation.extend" });
    expect(calls.slice(2)).toEqual([
      { endpoint: "review-flow-adaptation", payload: { projectId: PROJECT, flowId: "flow.kettle", adaptationId: "adaptation.extend", action: "approve" } },
      { endpoint: "review-flow-adaptation", payload: { projectId: PROJECT, flowId: "flow.kettle", adaptationId: "adaptation.extend", action: "apply" } }
    ]);
  });

  it("sets the change aside on a no, and runs nothing on a yes whose question it cannot read", async () => {
    const conversations = openConversations();
    const conversationId = await chat(conversations);
    const { port, calls } = fakePort({ "review-flow-adaptation": REVIEW_OK });
    const context = contextFor(conversations, conversationId, port);
    const ask = (askId: string, ref: string) => conversations.appendAutomationTurn({
      projectId: PROJECT, conversationId, text: "Apply?", attachment: { kind: AUTOMATION_STUDIO_CONVERSATION_COMMAND_ATTACHMENT, ref },
      ask: { askId, kind: "confirm", parks: false, timeoutMs: null, onTimeout: null, options: null, routes: null, consequences: ["modify_existing"], missing: null, control: null, permissionRequest: null }
    });
    const good = Buffer.from(JSON.stringify({ capabilityId: "adaptation.apply", arguments: { flowId: "flow.1", adaptationId: "adaptation.1" } })).toString("base64url");
    const denied = await ask("conversation-command.no", good);
    // A declined change is rejected, not left waiting: a waiting change refuses the Flow's next build.
    const setAside = await runConfirmedAutomationStudioConversationCommand({ ask: await conversations.answerAsk({ projectId: PROJECT, askId: "conversation-command.no", kind: "deny" }), attachment: denied.attachment, context });
    expect(setAside).toMatchObject({ capabilityId: "adaptation.reject", status: "done" });
    expect(calls.map((call) => [call.endpoint, call.payload.action])).toEqual([["review-flow-adaptation", "reject"]]);
    calls.length = 0;

    const unknown = Buffer.from(JSON.stringify({ capabilityId: "flow.delete", arguments: { flowId: "flow.1" } })).toString("base64url");
    const risky = await ask("conversation-command.delete", unknown);
    const refused = await runConfirmedAutomationStudioConversationCommand({ ask: await conversations.answerAsk({ projectId: PROJECT, askId: "conversation-command.delete", kind: "grant" }), attachment: risky.attachment, context });
    expect(refused).toMatchObject({ status: "failed" });
    // A no to a question whose meaning is not one Core sets aside does nothing.
    const other = await ask("conversation-command.other", unknown);
    expect(await runConfirmedAutomationStudioConversationCommand({ ask: await conversations.answerAsk({ projectId: PROJECT, askId: "conversation-command.other", kind: "deny" }), attachment: other.attachment, context })).toBeNull();
    expect(calls).toEqual([]);
  });

  it("describes a Flow in the request and answers done", async () => {
    const conversations = openConversations();
    const conversationId = await chat(conversations);
    const { port, calls } = fakePort({ "save-flow-generation-instruction": () => ({ ok: true }) });
    const execution = await executeAutomationStudioConversationCommand({ command: command("flow.describe"), context: contextFor(conversations, conversationId, port), arguments: { flowId: "flow.kettle", instruction: "Check kettle prices daily" } });
    expect(execution).toEqual({ capabilityId: "flow.describe", status: "done", summary: "Saved what this Flow should do.", flowId: "flow.kettle" });
    expect(calls).toEqual([{ endpoint: "save-flow-generation-instruction", payload: { projectId: PROJECT, flowId: "flow.kettle", authSessionId: "session.person", instruction: "Check kettle prices daily" } }]);
    expect((await turnsOf(conversations, conversationId))[0]?.attachment).toEqual({ kind: AUTOMATION_STUDIO_PANEL_CAPABILITY_RESULT_ATTACHMENT, ref: "flow.describe" });
  });

  it("explores onto a blank Flow and applies, and says so when the Flow is not blank", async () => {
    const conversations = openConversations();
    const conversationId = await chat(conversations);
    const { port, calls } = fakePort({
      "save-flow-generation-instruction": () => ({ ok: true }),
      "generate-flow-bootstrap-adaptation": (payload) => payload.flowId === "flow.blank" ? BUILD_OK(payload) : { ok: false, error: "Flow Bootstrap requires a blank top-level orchestration Flow." },
      "review-flow-adaptation": REVIEW_OK
    });
    const context = contextFor(conversations, conversationId, port);
    await executeAutomationStudioConversationCommand({ command: command("flow.explore"), context, arguments: { flowId: "flow.blank", instruction: "Find kettles" } });
    await executeAutomationStudioConversationCommand({ command: command("flow.explore"), context, arguments: { flowId: "flow.full" } });
    await automationStudioConversationCommandWork.idle();

    expect(calls.filter((call) => call.endpoint === "review-flow-adaptation").map((call) => call.payload.flowId)).toEqual(["flow.blank", "flow.blank"]);
    expect(calls.filter((call) => call.endpoint === "save-flow-generation-instruction")).toHaveLength(1);
    const texts = (await turnsOf(conversations, conversationId)).map((turn) => turn.text);
    expect(texts.some((text) => text.includes("put the steps that worked into the Flow"))).toBe(true);
    expect(texts.some((text) => text.includes("requires a blank top-level orchestration Flow") && text.includes("Nothing was changed."))).toBe(true);
  });

  it("runs a Flow in the background and reports how the run ended", async () => {
    const conversations = openConversations();
    const conversationId = await chat(conversations);
    const { port, calls } = fakePort({
      "run-runtime-session": () => ({ ok: true, payload: { runtimeSession: { runId: "run.7", status: "failed" }, terminalReason: "The price element never appeared." } })
    });
    const execution = await executeAutomationStudioConversationCommand({ command: command("run.execute"), context: contextFor(conversations, conversationId, port), arguments: { flowId: "flow.kettle" } });
    expect(execution.status).toBe("started");
    await automationStudioConversationCommandWork.idle();
    expect(calls).toEqual([{ endpoint: "run-runtime-session", payload: { projectId: PROJECT, flowId: "flow.kettle" } }]);
    const [result] = await turnsOf(conversations, conversationId);
    expect(result?.text).toBe("The run run.7 ended failed: The price element never appeared.");
    expect(result?.attachment?.ref).toBe("run.execute");
  });

  it("answers the thread's waiting question from the person's words, and never grants a delete by typing", async () => {
    const conversations = openConversations();
    const conversationId = await chat(conversations);
    const { port, calls } = fakePort({
      "answer-ask": async (payload) => ({ ok: true, payload: { ask: await conversations.answerAsk({ projectId: PROJECT, askId: String(payload.askId), kind: payload.kind as "grant" }) } })
    });
    const context = contextFor(conversations, conversationId, port);
    const confirm = (askId: string, consequences: Array<"delete" | "send_or_publish">) => conversations.appendAutomationTurn({
      projectId: PROJECT, conversationId, text: "May I?", attachment: null,
      ask: { askId, kind: "confirm", parks: false, timeoutMs: null, onTimeout: null, options: null, routes: null, consequences, missing: null, control: null, permissionRequest: null }
    });
    await confirm("ask.publish", ["send_or_publish"]);

    const answered = await executeAutomationStudioConversationCommand({ command: command("ask.answer"), context, arguments: { answer: "Yes, go ahead." } });
    expect(answered).toMatchObject({ status: "done", summary: "Answered yes." });
    expect(calls).toEqual([{ endpoint: "answer-ask", payload: { projectId: PROJECT, askId: "ask.publish", kind: "grant" } }]);
    expect((await conversations.getAsk({ projectId: PROJECT, askId: "ask.publish" }))?.status).toBe("answered");

    await confirm("ask.delete", ["delete"]);
    const refused = await executeAutomationStudioConversationCommand({ command: command("ask.answer"), context, arguments: { answer: "yes" } });
    expect(refused.status).toBe("failed");
    expect(refused.summary).toContain("PIN");
    expect(calls).toHaveLength(1);

    const unclear = await executeAutomationStudioConversationCommand({ command: command("ask.answer"), context, arguments: { answer: "hmm, maybe later on" } });
    expect(unclear.summary).toContain("could not tell whether that was a yes or a no");
  });

  it("turns a command that throws into a failed result in the thread", async () => {
    const conversations = openConversations();
    const conversationId = await chat(conversations);
    const port = { call: async (): Promise<AutomationStudioConversationCommandCallResult> => { throw new Error("database is locked"); } };
    const execution = await executeAutomationStudioConversationCommand({ command: command("flow.describe"), context: contextFor(conversations, conversationId, port), arguments: { flowId: "flow.kettle", instruction: "x" } });
    expect(execution.status).toBe("failed");
    expect(execution.summary).toContain("database is locked");
    expect((await turnsOf(conversations, conversationId))[0]?.text).toContain("database is locked");
  });
});
