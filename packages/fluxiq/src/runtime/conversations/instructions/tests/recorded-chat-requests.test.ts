// t973 (F19): three clear jobs typed into the extension's chat were answered in words by Haiku with
// no thinking -- one that deletes, two that look something up -- and nothing started. Each fixture is
// the chat call's own step 0001 (`request.json`, the exact body sent; `decision.json`, what came back).
// The requests were word for word those that started on 2026-11-11 with thinking, so the failure is
// the guidance read without thinking, and the answer it was allowed to give.
//
// Built from each recording: its message, the page it was typed on and the domain text it carried go
// through Core's chat instructions as they stand now, which must lead to a start; and the reply each
// recording got goes through the interpretation, which must not let it stand. No model is called.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseAutomationStudioPanelCapabilities } from "../../../../framework/automation-service/panel-capabilities/index.ts";
import {
  AUTOMATION_STUDIO_CONVERSATION_ANSWER_ASK,
  AUTOMATION_STUDIO_CONVERSATION_CREATE_HERE,
  AUTOMATION_STUDIO_CONVERSATION_DESCRIBE,
  AUTOMATION_STUDIO_CONVERSATION_EXPLORE,
  AUTOMATION_STUDIO_CONVERSATION_IMPROVE,
  AUTOMATION_STUDIO_CONVERSATION_RUN_FLOW
} from "../../commands/index.ts";
import {
  automationStudioConversationInstructions,
  interpretAutomationStudioConversationTurn,
  type AutomationStudioConversationDecisionContext,
  type AutomationStudioConversationModel,
  type AutomationStudioConversationModelRequest
} from "../index.ts";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const RECORDED = ["run-mwoqy6fo-f44d3e98", "run-mwos5phg-115e3a15", "run-mwosbjsl-2f856c26"] as const;
const QUICK = { attempts: 3, attemptTimeoutMs: 1_000, deadlineMs: 5_000, backoffMs: 1 };

type Recording = { runId: string; system: string; message: string; pageUrl: string; domainText: string; thinking: unknown; model: string; reply: string };

/** One recording, read from its own files: the exact body sent and what the model answered. */
function recording(runId: string): Recording {
  const body = JSON.parse(readFileSync(path.join(FIXTURES, `${runId}-0001-chat-request.json`), "utf8")) as { model: string; thinking: unknown; system: { text: string }[]; messages: { role: string; content: string }[] };
  const decision = JSON.parse(readFileSync(path.join(FIXTURES, `${runId}-0001-chat-decision.json`), "utf8")) as { response: string };
  const system = body.system[0]!.text;
  const pageUrl = /In their browser they are on the page (\S+)\. /u.exec(system)?.[1];
  const domainText = /None of these re-authorize\. Run what the person asked for\.\n\n([\s\S]+?)\n\nThis project has no Flows yet\./u.exec(system)?.[1];
  if (!pageUrl || !domainText) throw new Error(`${runId}: the recorded instructions are not the shape this test reads`);
  return { runId, system, message: body.messages[0]!.content, pageUrl, domainText, thinking: body.thinking, model: body.model, reply: decision.response };
}

/** The capabilities the extension offered on those calls, in the recorded order. Read inside a test, so the answer-first summary is the one parsed. */
function capabilities() {
  return parseAutomationStudioPanelCapabilities([
    AUTOMATION_STUDIO_CONVERSATION_CREATE_HERE.capability,
    AUTOMATION_STUDIO_CONVERSATION_DESCRIBE.capability,
    AUTOMATION_STUDIO_CONVERSATION_EXPLORE.capability,
    AUTOMATION_STUDIO_CONVERSATION_IMPROVE.capability,
    AUTOMATION_STUDIO_CONVERSATION_RUN_FLOW.capability,
    AUTOMATION_STUDIO_CONVERSATION_ANSWER_ASK.capability
  ]);
}

function context(recorded: Recording): AutomationStudioConversationDecisionContext {
  return { projectId: "project.home", capabilities: capabilities(), flows: [], onScreen: { pageUrl: recorded.pageUrl }, message: recorded.message };
}

/** A model that answers each attempt from a script, and keeps what each attempt was asked. */
function scripted(answers: readonly unknown[], seen: AutomationStudioConversationModelRequest[]): AutomationStudioConversationModel {
  return {
    name: "scripted",
    decide: async (request) => {
      seen.push(request);
      return answers[Math.min(seen.length - 1, answers.length - 1)];
    }
  };
}

describe.each(RECORDED)("the recorded chat request %s", (runId) => {
  beforeEach(() => { vi.stubEnv("FLUXIQ_AUTHORING_MODE", "answer-first"); });
  afterEach(() => { vi.unstubAllEnvs(); });
  const recorded = recording(runId);

  it("is the failure: Haiku, no thinking, the old answer shape, and a reply in words", () => {
    expect(recorded.model).toBe("claude-haiku-5-5");
    expect(recorded.thinking).toEqual({ type: "disabled" });
    expect(recorded.system).toContain('{"reply": "<your answer>"}   when they are not asking for anything to be done');
    expect(recorded.system).toContain("Do not ask whether you may do something ordinary.");
    expect(recorded.system).toContain("FluxIQ asks the person for it when it is needed.");
    expect(recorded.system).toContain("Does what the person asks on the page they have open, in one live pass");
    expect(Object.keys(JSON.parse(recorded.reply) as object)).toEqual(["reply"]);
  });

  it("now leads to a start: built from the same message, page and domain text, the guidance has no way to answer a job in words", () => {
    const text = automationStudioConversationInstructions(context(recorded), { transcriptWithheld: false, domainInstructions: recorded.domainText });
    // The answer opens with a declaration, and a reply is for conversation alone.
    expect(text).toContain('It first says what their message is, in "intent":');
    expect(text).toContain('A question whose answer has to be looked up on a site is a task, and so is a job that deletes, pays, sends or posts.');
    expect(text).toContain('{"intent": "conversation", "reply": "<your answer>"}   only for conversation.');
    expect(text).toContain("A task is never answered with a reply. Start it with the capability that does it, and give it a full effort");
    // The permission a dangerous act needs is FluxIQ's one question, never the model's, and there is no PIN to wait for.
    expect(text).toContain("FluxIQ itself asks the person once, in plain words, as the attempt starts; that question is never yours to ask.");
    expect(text).not.toContain("something ordinary");
    expect(text).not.toContain("asks the person for it when it is needed");
    // The attempt goes wherever on the site the job needs, and brings back what it found as well as what it changed.
    expect(text).toContain("flow.createHere -- Does what the person asks on the web in one live pass: it starts on the page they have open, goes wherever on the site the job needs");
    expect(text).toContain("whether that is something found, a list or table, an answer, or a change made");
    expect(text).toContain(`In their browser they are on the page ${recorded.pageUrl}.`);
    expect(text).toContain("They need not open any particular page first: it starts here and goes wherever on the site the job needs.");
    // The domain's text is the attempt's, not the chat's: the chat sees no page and need not read one.
    expect(text).toContain(`You see no page here and need not read one: the attempt does that.\n${recorded.domainText}`);
    // Nothing in the guidance names the site, the task or its answer.
    for (const word of recorded.message.split(/\W+/u).filter((token) => token.length > 8)) expect(text.toLowerCase()).not.toContain(` ${word.toLowerCase()} `);
  });

  it("does not let the recorded reply stand: it is asked again on the same model, and the start it gives is taken", async () => {
    const seen: AutomationStudioConversationModelRequest[] = [];
    const start = JSON.stringify({ intent: "task", do: "flow.createHere", with: { instruction: recorded.message } });
    const reading = await interpretAutomationStudioConversationTurn({ model: scripted([recorded.reply, start], seen), message: recorded.message, transcript: [], transcriptWithheld: false, context: context(recorded), domainInstructions: recorded.domainText, limits: QUICK });

    expect(reading.decision).toMatchObject({ kind: "invoke", invocation: { capabilityId: "flow.createHere", arguments: { instruction: recorded.message } } });
    expect(reading.attempts).toBe(2);
    expect(seen[0]!.climb).toBeUndefined();
    expect(seen[1]!.climb).toBeUndefined();
    expect(seen[1]!.correction).toContain('opens with "intent"');
  });

  it("starts the job when the model declares it a task and still only answers in words, on the same model", async () => {
    const seen: AutomationStudioConversationModelRequest[] = [];
    const declaredReply = JSON.stringify({ intent: "task", reply: (JSON.parse(recorded.reply) as { reply: string }).reply });
    const reading = await interpretAutomationStudioConversationTurn({ model: scripted([declaredReply], seen), message: recorded.message, transcript: [], transcriptWithheld: false, context: context(recorded), domainInstructions: recorded.domainText, limits: QUICK });

    expect(reading.decision).toMatchObject({ kind: "invoke", invocation: { capabilityId: "flow.createHere", arguments: { instruction: recorded.message } } });
    expect(reading.source).toBe("model");
    expect(seen.map((request) => request.climb?.reason)).toEqual([undefined, undefined, undefined]);
  });
});
