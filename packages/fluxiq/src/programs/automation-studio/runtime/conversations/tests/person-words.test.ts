// A build's instruction is the person's own words (t349).
//
// Lane A round 2 (`run-muylu4pp-f9cb2121`) saved the chat model's paraphrase
// of the person's message as the Flow's generation instruction. What is pinned
// here, through the real path a chat message takes -- the turn stored and read
// by a scripted chat model that paraphrases, Core's answer written, the command
// started from it -- is that create-here, explore and improve save what the
// person wrote, whole; that a request spread over a question and its answer is
// all saved, and words before something was last done are not; and that a
// caller with no person turn gets the argument, marked as such.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutomationStudioProjectDatabasePool } from "../../../storage/index.ts";
import { parseAutomationStudioPanelCapabilities } from "../../panel-capabilities/index.ts";
import { AutomationStudioConversations } from "../conversations.ts";
import { AUTOMATION_STUDIO_PANEL_CAPABILITY_RESULT_ATTACHMENT, type AutomationStudioConversationModel } from "../instructions/index.ts";
import {
  AUTOMATION_STUDIO_CONVERSATION_COMMANDS,
  automationStudioConversationCommandVocabulary,
  automationStudioConversationCommandWork,
  executeAutomationStudioConversationCommand,
  startAutomationStudioConversationCommand,
  type AutomationStudioConversationCommandCallResult,
  type AutomationStudioConversationCommandContext
} from "../commands/index.ts";

let rootDir = "";
let pool: AutomationStudioProjectDatabasePool | undefined;
const PROJECT = "project.verbatim";
const PAGE = "https://shop.example/kettles";
const FLOWS = [{ flowId: "flow.kettle", name: "Kettles" }];
const QUICK = { attempts: 1, attemptTimeoutMs: 1_000, deadlineMs: 2_000, backoffMs: 1 };
const CAPABILITIES = automationStudioConversationCommandVocabulary(parseAutomationStudioPanelCapabilities(["flow.createHere", "flow.explore", "flow.improve", "run.execute"].map((id) => ({ id }))));

type Call = { endpoint: string; payload: Record<string, unknown> };

/** Every registry call answers as the panel's would, except the build, which fails: what was saved before it is what is pinned. */
function fakePort() {
  const calls: Call[] = [];
  const answers: Record<string, AutomationStudioConversationCommandCallResult> = {
    "create-flow": { ok: true, payload: { flow: { flowId: "flow.new" } } },
    "save-flow-generation-instruction": { ok: true, payload: { instruction: { instructionId: "instruction.1" } } },
    "save-flow-instruction": { ok: true, payload: { instruction: { instructionId: "instruction.2" } } },
    "generate-flow-bootstrap-adaptation": { ok: false, error: "The build is not part of this test." }
  };
  return {
    calls,
    saved: () => calls.filter((call) => call.endpoint === "save-flow-generation-instruction" || call.endpoint === "save-flow-instruction"),
    port: { async call(endpoint: string, payload: Record<string, unknown>) { calls.push({ endpoint, payload }); return answers[endpoint] ?? { ok: false, error: `No fake for ${endpoint}.` }; } }
  };
}

/** A chat model that answers each message with the next scripted decision: here, a paraphrase in the command's argument. */
function paraphrasing(answers: unknown[]): AutomationStudioConversationModel {
  return { name: "scripted-paraphraser", decide: async () => answers.shift() ?? { reply: "Nothing to do." } };
}

async function chat(answers: unknown[]) {
  pool = new AutomationStudioProjectDatabasePool({ rootDir });
  const conversations = new AutomationStudioConversations(pool).bindModel(paraphrasing(answers));
  const { conversationId } = await conversations.openConversation({ projectId: PROJECT, subject: { kind: "project", id: PROJECT }, title: null });
  const fake = fakePort();
  const context: AutomationStudioConversationCommandContext = { port: fake.port, host: conversations, projectId: PROJECT, conversationId, sessionId: "session.person", keyLocked: false, paired: false, startLocation: PAGE };
  /** One message, as the append-turn handler takes it: read, answered, and the command it chose started. */
  const say = async (text: string) => {
    const answer = await conversations.respondToPersonTurn({ projectId: PROJECT, conversationId, text, actorId: "user.person", capabilities: CAPABILITIES, flows: FLOWS, onScreen: { pageUrl: PAGE }, limits: QUICK });
    const execution = await startAutomationStudioConversationCommand({ response: answer.response, context });
    await automationStudioConversationCommandWork.idle();
    return { answer, execution };
  };
  return { conversations, conversationId, context, say, ...fake };
}

describe("a build's instruction is the person's own words", () => {
  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(os.tmpdir(), "automation-studio-person-words-test-"));
    vi.stubEnv("FLUXIQ_AUTHORING_MODE", "");
  });

  afterEach(async () => {
    await automationStudioConversationCommandWork.idle();
    automationStudioConversationCommandWork.takeUnreported();
    if (pool) {
      await pool.closeAll();
      pool = undefined;
    }
    await rm(rootDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it("create-here saves the person's message, not the chat model's paraphrase, and names the Flow from it", async () => {
    const message = "Go through the kettles on this page, find every blue one under 30 dollars, and tell me the cheapest one's price. Also, thanks!";
    const world = await chat([{ do: "flow.createHere", with: { instruction: "Find cheap blue kettles." } }]);
    const { execution } = await world.say(message);
    expect(execution).toMatchObject({ capabilityId: "flow.createHere", status: "started" });
    expect(world.calls[0]).toEqual({ endpoint: "create-flow", payload: { projectId: PROJECT, name: "Go through the kettles on this page, find every blue one under 30 dollars..." } });
    // Kept whole, the thanks included: a span of it is not guessed at.
    expect(world.saved()).toEqual([{ endpoint: "save-flow-generation-instruction", payload: { projectId: PROJECT, flowId: "flow.new", authSessionId: "session.person", instruction: message } }]);
  });

  it("explore saves the person's message as the changed goal when the model says the goal changed", async () => {
    const message = "Actually, collect the towel prices instead of the kettles";
    const world = await chat([{ do: "flow.explore", with: { flowId: "flow.kettle", instruction: "Collect towel prices." } }]);
    await world.say(message);
    expect(world.saved()).toEqual([{ endpoint: "save-flow-generation-instruction", payload: { projectId: PROJECT, flowId: "flow.kettle", authSessionId: "session.person", instruction: message } }]);
  });

  it("explore saves nothing when the model leaves the goal as it is", async () => {
    const world = await chat([{ do: "flow.explore", with: { flowId: "flow.kettle" } }]);
    await world.say("Build it again by trying it on the site");
    expect(world.saved()).toEqual([]);
    expect(world.calls.map((call) => call.endpoint)).toEqual(["generate-flow-bootstrap-adaptation"]);
  });

  it("explore keeps the saved goal when the person only asked to build, whatever goal the model wrote", async () => {
    const world = await chat([{ do: "flow.explore", with: { flowId: "flow.kettle", instruction: "Collect every kettle price on the site." } }]);
    await world.say("Build it again");
    expect(world.saved()).toEqual([]);
    expect(world.calls.map((call) => call.endpoint)).toEqual(["generate-flow-bootstrap-adaptation"]);
  });

  it("improve saves the person's message as the required instruction, titled from it", async () => {
    const message = "It should also read each kettle's star rating and skip anything under four stars";
    const world = await chat([{ do: "flow.improve", with: { flowId: "flow.kettle", change: "Read ratings." } }]);
    await world.say(message);
    expect(world.saved()).toEqual([{ endpoint: "save-flow-instruction", payload: { projectId: PROJECT, flowId: "flow.kettle", title: "Improvement: It should also read each kettle's star rating and skip anything und...", body: message, requirement: "required", tags: ["generation"] } }]);
  });

  it("saves every person turn of a request spread over a question and its answer, without the assistant's words", async () => {
    const world = await chat([
      { reply: "Happy to. Which shop should it look at, and how many kettles?" },
      { do: "flow.createHere", with: { instruction: "Collect the first ten kettle prices from this shop." } }
    ]);
    await world.say("Make me an automation that collects kettle prices");
    await world.say("This shop, and only the first ten");
    expect(world.saved().map((call) => call.payload.instruction)).toEqual(["Make me an automation that collects kettle prices\n\nThis shop, and only the first ten"]);
  });

  it("leaves out what was said before something was last done in the thread", async () => {
    const world = await chat([
      { reply: "Running it." },
      { do: "flow.createHere", with: { instruction: "Find towels." } }
    ]);
    await world.say("Run my kettle automation please");
    // The panel records what it ran, as it does after running a capability itself.
    await world.conversations.appendTurn({ projectId: PROJECT, conversationId: world.conversationId, text: "Started the run.", attachment: { kind: AUTOMATION_STUDIO_PANEL_CAPABILITY_RESULT_ATTACHMENT, ref: "run.execute" } });
    await world.say("Now make one that finds bath towels under 10 dollars");
    expect(world.saved().map((call) => call.payload.instruction)).toEqual(["Now make one that finds bath towels under 10 dollars"]);
  });

  it("marks the outcome as the person's words when a person turn started the command", async () => {
    const world = await chat([{ do: "flow.createHere", with: { instruction: "Find cheap kettles." } }]);
    // Read and answered, but run here directly rather than started, so its outcome can be read.
    const answer = await world.conversations.respondToPersonTurn({ projectId: PROJECT, conversationId: world.conversationId, text: "Find every kettle under 30 dollars on this page", actorId: "user.person", capabilities: CAPABILITIES, flows: FLOWS, onScreen: { pageUrl: PAGE }, limits: QUICK });
    const outcome = await AUTOMATION_STUDIO_CONVERSATION_COMMANDS.get("flow.createHere")!.run({ ...world.context, answerTurnId: answer.response!.turnId }, { instruction: "Find cheap kettles." });
    expect(outcome.instructionFrom).toBe("person");
    expect(world.saved().map((call) => call.payload.instruction)).toEqual(["Find every kettle under 30 dollars on this page"]);
  });

  it("falls back to the argument for a caller with no person turn, and says so", async () => {
    const world = await chat([]);
    const outcome = await AUTOMATION_STUDIO_CONVERSATION_COMMANDS.get("flow.createHere")!.run(world.context, { instruction: "Find cheap kettles.", name: "Kettles" });
    expect(world.saved().map((call) => call.payload.instruction)).toEqual(["Find cheap kettles."]);
    expect(outcome.instructionFrom).toBe("argument");
    expect(outcome.summary).toContain('The Flow "Kettles" has no steps yet, but it keeps the instruction as the request worded it, since no message of yours came with it, so you can build it again.');

    const improved = await AUTOMATION_STUDIO_CONVERSATION_COMMANDS.get("flow.improve")!.run(world.context, { flowId: "flow.kettle", change: "Read ratings." });
    expect(improved.instructionFrom).toBe("argument");
    expect(improved.summary).toContain("Before that I saved what should change as an instruction on the Flow, as the request worded it, since no message of yours came with it.");
    expect(world.saved().at(-1)?.payload.body).toBe("Read ratings.");

    // Run through the executor with no turn of Core's to anchor on: the same fallback.
    await executeAutomationStudioConversationCommand({ command: AUTOMATION_STUDIO_CONVERSATION_COMMANDS.get("flow.explore")!, context: world.context, arguments: { flowId: "flow.kettle", instruction: "Collect towel prices." } });
    await automationStudioConversationCommandWork.idle();
    expect(world.saved().at(-1)?.payload.instruction).toBe("Collect towel prices.");
  });
});
