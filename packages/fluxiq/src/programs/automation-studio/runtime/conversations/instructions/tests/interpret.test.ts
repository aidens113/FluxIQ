// Reading a person's message as an instruction, with a scripted model and a
// clock that does not wait. No real provider is called.
//
// The fixture vocabulary is parsed through the same reader the endpoint uses,
// with `reauthorizes` deliberately left out: which capabilities stop for the
// person must come from Core's own gated consequence set, not from whatever the
// browser claimed.

import { describe, expect, it } from "vitest";
import { parseAutomationStudioPanelCapabilities } from "../../../panel-capabilities/index.ts";
import {
  interpretAutomationStudioConversationTurn,
  parseAutomationStudioConversationDecision,
  type AutomationStudioConversationDecisionContext,
  type AutomationStudioConversationModel,
  type AutomationStudioConversationModelRequest
} from "../index.ts";

const CAPABILITIES = parseAutomationStudioPanelCapabilities([
  {
    id: "run.execute",
    title: "Run a Flow",
    summary: "Run the Flow now and wait for its answer.",
    group: "Running",
    phrases: ["run the flow", "run it", "start the flow"],
    consequences: ["create_new"],
    arguments: [
      { name: "projectId", describe: "The project it belongs to.", required: true },
      { name: "flowId", describe: "The Flow it is about.", required: true }
    ]
  },
  {
    id: "flow.delete",
    title: "Delete a Flow",
    summary: "Remove the Flow and everything it holds.",
    group: "Flows",
    phrases: ["delete the flow", "remove the flow"],
    consequences: ["delete"],
    arguments: [
      { name: "projectId", describe: "The project it belongs to.", required: true },
      { name: "flowId", describe: "The Flow it is about.", required: true },
      { name: "authorizationPin", describe: "Your PIN.", required: true }
    ]
  },
  {
    id: "flow.create",
    title: "Create a Flow",
    summary: "Make a new, empty Flow.",
    group: "Flows",
    phrases: ["new flow", "create a flow"],
    consequences: ["create_new"],
    arguments: [{ name: "name", describe: "What to call it.", required: false }]
  },
  {
    id: "flow.settings",
    title: "Change a Flow's settings",
    summary: "Change how the Flow runs.",
    group: "Settings",
    phrases: ["change the settings"],
    consequences: ["modify_existing"],
    arguments: [{ name: "flowId", describe: "The Flow it is about.", required: true }, { name: "settings", describe: "What to change.", required: true }]
  },
  {
    id: "change.reject",
    title: "Reject a change",
    summary: "Put a change the model made back the way it was.",
    group: "Versions",
    phrases: ["reject that change"],
    consequences: ["modify_existing"],
    arguments: [
      { name: "projectId", describe: "The project it belongs to.", required: true },
      { name: "adaptationId", describe: "The change to roll back.", required: true }
    ]
  }
]);

const FLOWS = [
  { flowId: "flow.kettle-1", name: "Kettle price checker" },
  { flowId: "flow.toaster-2", name: "Toaster stock watch" }
];

function context(overrides: Partial<AutomationStudioConversationDecisionContext> = {}): AutomationStudioConversationDecisionContext {
  return { projectId: "project.home", capabilities: CAPABILITIES, flows: FLOWS, onScreen: {}, ...overrides };
}

/** A model that answers from a script, one entry per call; an Error entry is thrown. */
function scripted(...answers: unknown[]): AutomationStudioConversationModel & { requests: AutomationStudioConversationModelRequest[] } {
  const requests: AutomationStudioConversationModelRequest[] = [];
  return {
    name: "scripted",
    requests,
    decide: async (request) => {
      requests.push(request);
      const answer = answers.shift();
      if (answer instanceof Error) throw answer;
      return answer;
    }
  };
}

const INSTANT = { now: () => 0, wait: async () => undefined };

function interpret(model: AutomationStudioConversationModel | null, message: string, overrides: Partial<AutomationStudioConversationDecisionContext> = {}) {
  return interpretAutomationStudioConversationTurn({ model, message, transcript: [], transcriptWithheld: false, context: context(overrides), clock: INSTANT });
}

function providerError(code: string, retryable: boolean): Error {
  return Object.assign(new Error(`provider said ${code}`), { code, retryable });
}

describe("reading a person's message as an instruction", () => {
  it('resolves "run my kettle flow" to the run capability with the right Flow', async () => {
    const model = scripted('{"do": "run.execute", "with": {"flowId": "kettle"}}');
    const result = await interpret(model, "run my kettle flow");

    expect(result.source).toBe("model");
    expect(result.decision).toMatchObject({
      kind: "invoke",
      invocation: { capabilityId: "run.execute", arguments: { flowId: "flow.kettle-1", projectId: "project.home" }, asksFirst: false, confidence: 1 }
    });
    // The model was handed the vocabulary and the project's Flows by name.
    expect(model.requests[0]?.instructions).toContain("run.execute -- Run the Flow now");
    expect(model.requests[0]?.instructions).toContain("Kettle price checker (flow.kettle-1)");
    expect(model.requests[0]?.message).toBe("run my kettle flow");
  });

  it("resolves a garbled capability name and a misnamed argument to their closest match rather than refusing", async () => {
    const result = await interpret(scripted({ capability: "run.exectue", arguments: { flow: "Toaster stock watch" } }), "run the toaster one");
    expect(result.decision.kind).toBe("invoke");
    if (result.decision.kind !== "invoke") return;
    expect(result.decision.invocation.capabilityId).toBe("run.execute");
    expect(result.decision.invocation.requestedId).toBe("run.exectue");
    expect(result.decision.invocation.confidence).toBeLessThan(1);
    expect(result.decision.invocation.renamedArguments).toEqual({ flow: "flowId" });
    expect(result.decision.invocation.arguments.flowId).toBe("flow.toaster-2");
  });

  it("takes a paraphrased id by its words: flow.run is run.execute", async () => {
    const result = await interpret(scripted('{"do": "flow.run"}'), "run it", { onScreen: { flowId: "flow.kettle-1" } });
    expect(result.decision).toMatchObject({ kind: "invoke", invocation: { capabilityId: "run.execute", arguments: { flowId: "flow.kettle-1" } } });
  });

  it("asks first for a delete, and for nothing else, from Core's own gated set", async () => {
    const deleting = await interpret(scripted('{"do": "flow.delete", "with": {"flowId": "kettle", "authorizationPin": "1234"}}'), "delete the kettle flow");
    expect(deleting.decision).toMatchObject({ kind: "invoke", invocation: { capabilityId: "flow.delete", asksFirst: true, consequences: ["delete"] } });
    // A PIN is never taken from a model.
    if (deleting.decision.kind === "invoke") expect(deleting.decision.invocation.arguments).not.toHaveProperty("authorizationPin");

    const editing = await interpret(scripted('{"do": "flow.settings", "with": {"flowId": "kettle", "settings": {"retries": 5}}}'), "retry kettle five times");
    expect(editing.decision).toMatchObject({ kind: "invoke", invocation: { capabilityId: "flow.settings", asksFirst: false, consequences: [] } });
  });

  it("keeps the project the thread belongs to, whatever project the model wrote", async () => {
    // Live DeepSeek once wrote the Flow's id into projectId.
    const result = await interpret(scripted('{"do": "run.execute", "with": {"projectId": "flow.kettle-1", "flowId": "flow.kettle-1"}}'), "run the kettle one");
    expect(result.decision).toMatchObject({ kind: "invoke", invocation: { arguments: { projectId: "project.home", flowId: "flow.kettle-1" } } });
  });

  it("takes a Flow written where the project goes as the Flow, rather than losing it", async () => {
    // Live DeepSeek, "shw me wat ran latly on teh news one": {"do": "run.list", "with": {"projectId": "flow.news-5d0"}}.
    const result = await interpret(scripted('{"do": "run.execute", "with": {"projectId": "flow.toaster-2"}}'), "rn teh toastr one");
    expect(result.decision).toMatchObject({ kind: "invoke", invocation: { arguments: { projectId: "project.home", flowId: "flow.toaster-2" }, renamedArguments: { projectId: "flowId" } } });
  });

  it("never renames an argument onto the project, where the thread's own would overwrite it", async () => {
    // Live DeepSeek, "roll the news digest back to its previous version", against a
    // capability with no Flow argument: `flowId` was renamed to `projectId` and lost.
    const result = await interpret(scripted('{"do": "change.reject", "with": {"flowId": "Kettle price checker", "adaptationId": "adaptation.9"}}'), "reject that change on the kettle one");
    expect(result.decision).toMatchObject({ kind: "invoke", invocation: { arguments: { projectId: "project.home", adaptationId: "adaptation.9" }, droppedArguments: ["flowId"], renamedArguments: {} } });
  });

  it("asks for what a capability cannot go without, rather than running it and failing in the panel", async () => {
    const result = await interpret(scripted('{"do": "change.reject"}'), "reject that change");
    expect(result.decision).toEqual({ kind: "clarify", question: 'To "Reject a change" I still need the change to roll back. What should I use?' });
  });

  it("asks one question when a Flow is needed and several could be meant", async () => {
    const result = await interpret(scripted('{"do": "run.execute"}'), "run a flow");
    expect(result.decision.kind).toBe("clarify");
    if (result.decision.kind === "clarify") expect(result.decision.question).toContain('"Kettle price checker" or "Toaster stock watch"');
  });

  it("passes the model's own question and reply through", async () => {
    expect((await interpret(scripted('{"ask": "Which site?"}'), "check prices")).decision).toEqual({ kind: "clarify", question: "Which site?" });
    expect((await interpret(scripted("Happy to help."), "thanks")).decision).toEqual({ kind: "reply", text: "Happy to help." });
  });

  it("retries a transient failure and succeeds", async () => {
    const model = scripted(providerError("llm.provider_timeout", true), '{"do": "flow.create", "with": {"name": "Weather"}}');
    const result = await interpret(model, "make a weather flow");
    expect(result).toMatchObject({ source: "model", attempts: 2, decision: { kind: "invoke", invocation: { capabilityId: "flow.create", arguments: { name: "Weather" } } } });
  });

  it("asks again, with the reason, when the answer tried to be an object and could not be read", async () => {
    const model = scripted('{"do": "run.execute", "with": {', '{"reply": "Done reading."}');
    const result = await interpret(model, "anything");
    expect(result.attempts).toBe(2);
    expect(model.requests[1]?.correction).toContain("could not be read");
  });

  it("does not retry a failure the provider says will not change, and reads the words itself", async () => {
    const model = scripted(providerError("llm.provider_auth_failed", false));
    const result = await interpret(model, "run my kettle flow");
    expect(model.requests).toHaveLength(1);
    expect(result).toMatchObject({
      source: "closest_match",
      modelProblem: "the model's credentials were not accepted",
      decision: { kind: "invoke", invocation: { capabilityId: "run.execute", arguments: { flowId: "flow.kettle-1" } } }
    });
  });

  it("gives up after three failed attempts and still answers", async () => {
    const model = scripted(providerError("llm.provider_network_error", true), providerError("llm.provider_network_error", true), providerError("llm.provider_network_error", true));
    const result = await interpret(model, "good morning");
    expect(model.requests).toHaveLength(3);
    expect(result.source).toBe("closest_match");
    expect(result.modelProblem).toBe("the model could not be reached");
    expect(result.decision.kind).toBe("reply");
  });

  it("acts on the words with no model connected at all", async () => {
    const result = await interpret(null, "please delete the toaster flow");
    expect(result).toMatchObject({
      source: "closest_match",
      attempts: 0,
      decision: { kind: "invoke", invocation: { capabilityId: "flow.delete", asksFirst: true, arguments: { flowId: "flow.toaster-2" } } }
    });
    expect((await interpret(null, "what can you do?")).decision).toMatchObject({ kind: "reply", text: expect.stringContaining("Run a Flow") });
  });
});

describe("the answer a model writes, read forgivingly", () => {
  const read = (raw: unknown) => parseAutomationStudioConversationDecision(raw, context());

  it("reads a fenced block, prose around the object, and other names for the same fields", () => {
    expect(read('Sure!\n```json\n{"action": "invoke", "capability_id": "flow.create", "params": {"name": "Weather"}}\n```')).toMatchObject({
      kind: "invoke",
      invocation: { capabilityId: "flow.create", arguments: { name: "Weather" } }
    });
    expect(read({ type: "clarify", question: "Which one?" })).toEqual({ kind: "clarify", question: "Which one?" });
    expect(read({ output: '{"reply": "hello"}' })).toEqual({ kind: "reply", text: "hello" });
  });

  it("takes arguments written as a JSON string", () => {
    expect(read({ do: "run.execute", with: '{"flowId": "flow.kettle-1"}' })).toMatchObject({ kind: "invoke", invocation: { arguments: { flowId: "flow.kettle-1" } } });
  });

  it("reads plain words as a reply, and answers null only for a broken object", () => {
    expect(read("I can do that later.")).toEqual({ kind: "reply", text: "I can do that later." });
    expect(read('{"do": ')).toBeNull();
  });
});
