// @fluxiq-test-group real-sql
// The assistant's tool loop over a scripted model and a stand-in program API:
// a chain of tools completes, the allowance stops a message in plain words,
// loop detection steers and then stops a repeated call, a clearly asked
// deletion runs with a grant minted for it, an unclear one waits on a card that
// Allow runs once and Don't never runs. The real registry, IAM and press grants
// are exercised in `programs/automation-studio/api/panel-assistant/tests/`.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AssistantToolEntry } from "@fluxiq/contracts/program-api-inputs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import { PanelAssistant } from "../panel-assistant.ts";
import { PanelAssistantThreads } from "../store/index.ts";
import type { PanelAssistantActor, PanelAssistantModel, PanelAssistantModelRequest, PanelAssistantPrograms, PanelAssistantSettings, PanelAssistantTarget } from "../types.ts";

const tool = (endpoint: string, summary: string, consequence: AssistantToolEntry["consequence"], contextArgs: AssistantToolEntry["contextArgs"] = {}): AssistantToolEntry =>
  ({ name: `studio__${endpoint}`, programId: "studio", endpoint, summary, phrases: [], consequence, contextArgs, inputSchema: { type: "object" } });

const TOOLS: AssistantToolEntry[] = [
  tool("list-flows", "Lists the Flows in a project.", "read", { projectId: "projectId" }),
  tool("get-flow", "Reads one Flow.", "read", { projectId: "projectId", flowId: "flowId" }),
  tool("rename-flow", "Renames a Flow.", "change", { projectId: "projectId", flowId: "flowId" }),
  tool("delete-flow", "Deletes a Flow.", "delete", { projectId: "projectId", flowId: "flowId" })
];
const FLOW_NAMES: Record<string, string> = { "flow.old": "Old search", "flow.new": "New search" };
const ACTOR: PanelAssistantActor = { userId: "user.ada", sessionId: "session.ada" };

function programs(): PanelAssistantPrograms & { call: ReturnType<typeof vi.fn>; mintPress: ReturnType<typeof vi.fn> } {
  const call = vi.fn<PanelAssistantPrograms["call"]>(async (made) => ({ ok: true, payload: { ran: made.tool.endpoint, input: made.input } }));
  const mintPress = vi.fn<PanelAssistantPrograms["mintPress"]>(async () => ({ ok: true, grant: "grant.minted" }));
  return {
    tools: () => TOOLS,
    find: (query) => TOOLS.filter((candidate) => candidate.summary.toLowerCase().includes(query.toLowerCase())),
    consequencesOf: async (made) => [made.tool.consequence === "per-call" ? "change" : made.tool.consequence],
    describeTarget: async (made): Promise<PanelAssistantTarget | undefined> => {
      const flowId = made.input.flowId;
      if (typeof flowId !== "string") return undefined;
      const name = FLOW_NAMES[flowId];
      return { items: [name === undefined ? { kind: "Flow", id: flowId, contextKey: "flowId" } : { kind: "Flow", id: flowId, name, contextKey: "flowId" }] };
    },
    projectedCostUsd: async () => undefined,
    selectionNames: async (context) => (context.flowId ? { flow: FLOW_NAMES[context.flowId] ?? "a Flow" } : {}),
    needsPress: (made) => made.tool.consequence === "delete",
    call,
    mintPress
  };
}

/** Answers each decision in turn (a function sees the request), then replies "Done." for good. */
function scripted(decisions: ReadonlyArray<unknown | ((request: PanelAssistantModelRequest) => unknown)>, costUsd = 0): PanelAssistantModel & { requests: PanelAssistantModelRequest[] } {
  const requests: PanelAssistantModelRequest[] = [];
  return {
    name: "scripted",
    requests,
    decide: async (request) => {
      requests.push(request);
      const next = decisions[requests.length - 1];
      const decision = next === undefined ? { reply: "Done." } : typeof next === "function" ? (next as (request: PanelAssistantModelRequest) => unknown)(request) : next;
      return { decision, costUsd };
    }
  };
}

function settings(allowanceUsd: number | undefined): PanelAssistantSettings {
  let chosen = allowanceUsd;
  return { allowanceUsd: async () => chosen, setAllowanceUsd: async (usd) => (chosen = usd) };
}

let rootDir = "";
let threads: PanelAssistantThreads;

function assistantWith(model: PanelAssistantModel, port = programs(), allowanceUsd?: number) {
  const assistant = new PanelAssistant({ threads: () => threads, programs: port }).bindModelSource(async () => ({ ok: true, model })).bindSettings(settings(allowanceUsd));
  return { assistant, port };
}

async function texts(assistant: PanelAssistant, conversationId: string): Promise<string[]> {
  const thread = await assistant.readThread(ACTOR, { conversationId, limit: 200 });
  return (thread?.turns ?? []).map((turn) => turn.text);
}

describe("PanelAssistant", () => {
  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-panel-assistant-"));
    threads = new PanelAssistantThreads({ rootDir });
  });

  afterEach(async () => {
    await threads.close();
    await rm(rootDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  });

  it("completes a chain of three tools and answers, posting each call as its own step", async () => {
    const model = scripted([
      { tool: "find_tools", input: { query: "rename" }, why: "to find how to rename" },
      { tool: "studio__get-flow", input: {}, why: "to read the Flow first" },
      { tool: "call_tool", input: { name: "studio__rename-flow", input: { name: "Cheapest listings" } }, why: "you asked for a clearer name" },
      { reply: "Renamed it to “Cheapest listings”." }
    ]);
    const { assistant, port } = assistantWith(model);
    const sent = await assistant.send(ACTOR, {}, { text: "rename this flow to Cheapest listings", onScreen: { page: "flows", selection: { projectId: "p.1", flowId: "flow.old" } } });
    expect(await sent.working).toMatchObject({ ending: "replied" });
    expect(port.call.mock.calls.map(([made]) => [made.tool.endpoint, made.input])).toEqual([
      ["get-flow", { projectId: "p.1", flowId: "flow.old" }],
      ["rename-flow", { name: "Cheapest listings", projectId: "p.1", flowId: "flow.old" }]
    ]);
    expect(await texts(assistant, sent.conversation.conversationId)).toEqual([
      "rename this flow to Cheapest listings",
      "**Looking for a way to do that** — to find how to rename. Found 1 way to go about it.",
      "**Reading one Flow** — to read the Flow first. Done.",
      "**Renaming a Flow** — you asked for a clearer name. Done.",
      "Renamed it to “Cheapest listings”."
    ]);
    expect(model.requests[0]!.instructions).toContain("Where the person is: On Flows › “Old search”.");
    expect(model.requests[3]!.transcript.at(-1)!.text).toContain('"ran":"rename-flow"');
  });

  it("stops a message whose allowance is used, in plain words, with nothing more asked", async () => {
    const model = scripted([...Array.from({ length: 20 }, (_, index) => ({ tool: "studio__get-flow", input: { flowId: `flow.${index}` }, why: "" }))], 0.03);
    const { assistant } = assistantWith(model, programs(), 0.05);
    const sent = await assistant.send(ACTOR, {}, { text: "read all my flows" });
    expect(await sent.working).toMatchObject({ ending: "allowance", spentUsd: 0.06 });
    expect(model.requests).toHaveLength(2);
    expect((await texts(assistant, sent.conversation.conversationId)).at(-1)).toBe("I stopped here: this message used its spending allowance of $0.05 ($0.06 spent). Send another message to go on, or raise the allowance in Settings.");
  });

  it("steers a repeated identical call, refuses it, then stops and says so", async () => {
    const same = { tool: "studio__list-flows", input: { projectId: "p.1" }, why: "to see the Flows" };
    const model = scripted(Array.from({ length: 50 }, () => same));
    const { assistant, port } = assistantWith(model);
    const sent = await assistant.send(ACTOR, {}, { text: "show my flows" });
    expect(await sent.working).toMatchObject({ ending: "loop" });
    expect(port.call).toHaveBeenCalledTimes(3);
    const said = await texts(assistant, sent.conversation.conversationId);
    expect(said.filter((text) => text.startsWith("**Noticed it was repeating itself**")).length).toBeGreaterThanOrEqual(2);
    expect(said.at(-1)).toBe("I stopped because I kept repeating the same step without getting anywhere. Tell me what to try differently and I will go on from here.");
    expect(model.requests.length).toBeLessThan(10);
  });

  it("runs a deletion the words clearly ask for, with a grant minted for exactly that call", async () => {
    const model = scripted([{ tool: "studio__delete-flow", input: { projectId: "p.1", flowId: "flow.old" }, why: "you asked to delete it" }, { reply: "Deleted “Old search”." }]);
    const { assistant, port } = assistantWith(model);
    const sent = await assistant.send(ACTOR, { domainId: null }, { text: "delete Old search" });
    expect(await sent.working).toMatchObject({ ending: "replied" });
    expect(port.mintPress).toHaveBeenCalledTimes(1);
    expect(port.call).toHaveBeenCalledTimes(1);
    expect(port.call.mock.calls[0]![2]).toEqual({ scope: { domainId: null }, pressGrant: "grant.minted" });
  });

  it("asks with a card for a deletion the words do not clearly ask for; Allow runs it once, Don't runs nothing", async () => {
    const deletion = { tool: "studio__delete-flow", input: { projectId: "p.1", flowId: "flow.old" }, why: "it is unused" };
    const model = scripted([deletion, { reply: "Deleted it." }, deletion]);
    const { assistant, port } = assistantWith(model);
    const sent = await assistant.send(ACTOR, {}, { text: "clean things up" });
    expect(await sent.working).toMatchObject({ ending: "asked" });
    expect(port.call).not.toHaveBeenCalled();
    const card = (await assistant.readThread(ACTOR, { conversationId: sent.conversation.conversationId }))!.turns.at(-1)!;
    expect(card.text).toBe("Delete the Flow “Old search”? It cannot be undone.");
    expect(card.ask).toMatchObject({ kind: "confirm", status: "pending", consequences: ["delete"] });

    const allowed = await assistant.answer(ACTOR, {}, { askId: card.ask!.askId, kind: "grant" });
    expect(await allowed.working).toMatchObject({ ending: "replied" });
    expect(port.mintPress).toHaveBeenCalledTimes(1);
    expect(port.call).toHaveBeenCalledTimes(1);
    expect(port.call.mock.calls[0]![1]).toBe(ACTOR);
    expect(port.call.mock.calls[0]![2]).toEqual({ scope: {}, pressGrant: "grant.minted" });
    await expect(assistant.answer(ACTOR, {}, { askId: card.ask!.askId, kind: "grant" })).resolves.toBeDefined();
    await assistant.idle();
    expect(port.call).toHaveBeenCalledTimes(1);

    const again = await assistant.send(ACTOR, {}, { conversationId: sent.conversation.conversationId, text: "and the other one" });
    expect(await again.working).toMatchObject({ ending: "asked" });
    const second = (await assistant.readThread(ACTOR, { conversationId: sent.conversation.conversationId, limit: 200 }))!.turns.at(-1)!;
    const declined = await assistant.answer(ACTOR, {}, { askId: second.ask!.askId, kind: "deny" });
    expect(await declined.working).toMatchObject({ ending: "replied" });
    expect(port.call).toHaveBeenCalledTimes(1);
    expect((await texts(assistant, sent.conversation.conversationId)).at(-1)).toBe("OK, I did not do that.");
  });

  it("says plainly when there is no model, and runs nothing", async () => {
    const port = programs();
    const assistant = new PanelAssistant({ threads: () => threads, programs: port }).bindModelSource(async () => ({ ok: false, reason: "Add a model key in Settings to use the assistant." }));
    const sent = await assistant.send(ACTOR, {}, { text: "hello" });
    expect(await sent.working).toMatchObject({ ending: "no_model" });
    expect((await texts(assistant, sent.conversation.conversationId)).at(-1)).toBe("Add a model key in Settings to use the assistant.");
    expect(await assistant.allowance()).toEqual({ allowanceUsd: 0.5, chosen: false, defaultUsd: 0.5 });
  });

  it("tells the model what it could not read, and goes on", async () => {
    const model = scripted(["not json", { reply: "Here you are." }]);
    const { assistant } = assistantWith(model);
    const sent = await assistant.send(ACTOR, {}, { text: "hi" });
    expect(await sent.working).toMatchObject({ ending: "replied" });
    expect(model.requests[1]!.transcript.at(-1)!.text).toContain("The answer was not JSON.");
  });

  it("runs no tool that does not exist, and tells the model so", async () => {
    const model = scripted([{ tool: "studio__nothing-like-it", input: {} as JsonObject, why: "" }, { reply: "I cannot do that." }]);
    const { assistant, port } = assistantWith(model);
    const sent = await assistant.send(ACTOR, {}, { text: "do the impossible" });
    expect(await sent.working).toMatchObject({ ending: "replied" });
    expect(port.call).not.toHaveBeenCalled();
    expect(model.requests[1]!.transcript.at(-1)!.text).toContain("There is no tool called “studio__nothing-like-it”.");
  });
});
