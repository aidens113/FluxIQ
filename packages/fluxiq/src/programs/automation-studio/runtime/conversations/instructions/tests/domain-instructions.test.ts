// The bound domain's own system instructions reach the chat's model too: after
// the panel's fixed vocabulary, before what only this message knows (the
// project's Flows, what is on screen), with Core's answer-shape rules still
// last. Without them the chat's instructions are exactly what they were.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AutomationStudioProjectDatabasePool } from "../../../../storage/index.ts";
import { automationStudioPanelCapabilityVocabulary, parseAutomationStudioPanelCapabilities } from "../../../panel-capabilities/index.ts";
import { AutomationStudioConversations } from "../../conversations.ts";
import {
  automationStudioConversationInstructions,
  interpretAutomationStudioConversationTurn,
  type AutomationStudioConversationDecisionContext,
  type AutomationStudioConversationModel,
  type AutomationStudioConversationModelRequest
} from "../index.ts";

const DOMAIN_TEXT = "Pages are web pages.\nA control is named by its visible label.";
const CAPABILITIES = parseAutomationStudioPanelCapabilities([{ id: "run.execute", title: "Run a Flow", summary: "Run the Flow now.", group: "Running", phrases: ["run it"], consequences: [], arguments: [] }]);
const CONTEXT: AutomationStudioConversationDecisionContext = { projectId: "project.home", capabilities: CAPABILITIES, flows: [{ flowId: "flow.kettle-1", name: "Kettle price checker" }], onScreen: {} };
const QUICK = { attempts: 1, attemptTimeoutMs: 1_000, deadlineMs: 2_000, backoffMs: 1 };

function capturing(seen: AutomationStudioConversationModelRequest[]): AutomationStudioConversationModel {
  return { name: "capturing", decide: async (request) => { seen.push(request); return { reply: "Hello." }; } };
}

describe("the chat's instructions with a domain's own", () => {
  it("place the text after the vocabulary and before the Flows, and keep the answer shape last", () => {
    const plain = automationStudioConversationInstructions(CONTEXT, { transcriptWithheld: false });
    const withDomain = automationStudioConversationInstructions(CONTEXT, { transcriptWithheld: false, domainInstructions: DOMAIN_TEXT });
    const vocabulary = automationStudioPanelCapabilityVocabulary(CAPABILITIES);

    expect(withDomain.startsWith(`${vocabulary}\n\n${DOMAIN_TEXT}\n\nThe Flows in this project:`)).toBe(true);
    expect(withDomain.indexOf(DOMAIN_TEXT)).toBeLessThan(withDomain.indexOf("Kettle price checker"));
    expect(withDomain.indexOf(DOMAIN_TEXT)).toBeLessThan(withDomain.indexOf("Answer with one JSON object"));
    // Remove the domain's text and its separator, and the instructions are exactly what they were.
    expect(withDomain.replace(`\n\n${DOMAIN_TEXT}`, "")).toBe(plain);
  });

  it("are unchanged without one", () => {
    expect(automationStudioConversationInstructions(CONTEXT, { transcriptWithheld: true, domainInstructions: undefined })).toBe(automationStudioConversationInstructions(CONTEXT, { transcriptWithheld: true }));
    expect(automationStudioConversationInstructions(CONTEXT, { transcriptWithheld: false, domainInstructions: "" })).toBe(automationStudioConversationInstructions(CONTEXT, { transcriptWithheld: false }));
  });

  it("reach the model on every attempt of an interpretation", async () => {
    const seen: AutomationStudioConversationModelRequest[] = [];

    await interpretAutomationStudioConversationTurn({ model: capturing(seen), message: "Run it.", transcript: [], transcriptWithheld: false, context: CONTEXT, domainInstructions: DOMAIN_TEXT, limits: QUICK });

    expect(seen).toHaveLength(1);
    expect(seen[0]?.instructions).toContain(`\n\n${DOMAIN_TEXT}\n\n`);
    expect(seen[0]?.message).toBe("Run it.");
  });
});

describe("the conversations collaborator", () => {
  let rootDir = "";
  let pool: AutomationStudioProjectDatabasePool | undefined;

  afterEach(async () => {
    await pool?.closeAll();
    pool = undefined;
    if (rootDir) await rm(rootDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  });

  it("reads the bound domain's instructions for each message, so a runtime bound later is the one the model is told about", async () => {
    rootDir = await mkdtemp(path.join(os.tmpdir(), "automation-studio-conversation-domain-instructions-"));
    pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const seen: AutomationStudioConversationModelRequest[] = [];
    let bound: string | undefined;
    const conversations = new AutomationStudioConversations(pool).bindModel(capturing(seen)).bindDomainInstructions(() => bound);
    const opened = await conversations.openConversation({ projectId: "project.home", subject: { kind: "project", id: "project.home" }, title: null });
    const say = (text: string) => conversations.respondToPersonTurn({ projectId: "project.home", conversationId: opened.conversationId, text, actorId: "user.aiden", capabilities: CAPABILITIES, flows: [], onScreen: {}, limits: QUICK });

    await say("Hello.");
    bound = DOMAIN_TEXT;
    await say("Run it.");

    expect(seen).toHaveLength(2);
    expect(seen[0]?.instructions).not.toContain(DOMAIN_TEXT);
    expect(seen[1]?.instructions).toContain(`\n\n${DOMAIN_TEXT}\n\n`);
  });
});
