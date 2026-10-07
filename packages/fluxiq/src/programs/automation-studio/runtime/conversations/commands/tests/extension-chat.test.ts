import { plan } from "../../../tests/service-bootstrap/tests/fixtures.ts";
// The browser extension's chat, end to end in Core: what the extension's relay
// sends reaches a real service through the real registry, and the Flow gets
// built, improved and run.
//
// Only the edges are fake. The model the build asks is a scripted provider,
// the page is a scripted evidence runtime (one look, and running a node of the
// library), and the chat's own reading is a scripted conversation model. The
// registry, every endpoint handler, the conversation store, the executor, the
// build, the review and the run are the real ones. The caller is what a paired
// extension's token becomes (`apps/web/src/lib/program-route.ts`
// `pairedClientActor`): the approving person, under a `client-gateway:`
// session, with only the four permissions a token may hold. The messages are
// what `background/panel/conversation-relay.ts` sends: capability ids only,
// and the page the person is on.
//
// **A build finishes only once its whole Flow ran from its start and was judged
// to do what was asked (t244, user 2026-10-02).** So the scripted page can run
// its steps again (`automationStudioReplayingBinding`), the scripted provider
// also answers as the judge, and an improvement -- an extend build, which
// carries the Flow's steps -- reruns each carried step before it finishes.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { GlobalProgramApiRegistry, type ProgramApiActor } from "../../../../../_shared/api.ts";
import { registerAutomationStudioApi } from "../../../../api/handlers/index.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import { automationStudioActivityHub } from "../../../activity/index.ts";
import { AUTOMATION_STUDIO_SESSION_KEY_PROVIDER_DEFAULTS, type AutomationStudioLlmEvidenceRuntimeBinding, type AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../native-node-runtime.ts";
import type { AutomationStudioLlmProviderResolverInput } from "../../../service.ts";
import { AutomationStudioService } from "../../../service.ts";
import { automationStudioReplayingBinding } from "../../../tests/replaying-binding.ts";
import { AUTOMATION_STUDIO_CONVERSATION_EXPLORE, automationStudioConversationCommandWork } from "../index.ts";

const OPEN_ID = "domain.example.open";
const SEARCH_ID = "domain.example.search";
const PAGE = "https://shop.example.test/products";
const UNLOCKED_SESSION = "identity.session.unlocked";
/** What a token may hold (`PAIRED_CLIENT_PERMISSIONS`). */
const PAIRED: ProgramApiActor = {
  sessionId: "client-gateway:gw-test",
  userId: "user.person",
  roleId: "operator",
  permissions: ["programs.read", "programs.write", "runtime.control", "flows.write"]
};
const EXTENSION_CAPABILITIES = ["flow.createHere", "flow.describe", "flow.explore", "flow.improve", "run.execute", "ask.answer"].map((id) => ({ id }));

let tempRoot: string;
let world: World | null = null;

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-extension-chat-"));
});

afterEach(async () => {
  await automationStudioConversationCommandWork.idle();
  world?.stopActivity();
  await world?.service.close();
  world = null;
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

function definition(id: string, label: string): AutomationStudioNodeDefinition {
  return {
    schemaVersion: "0.1",
    id,
    version: "1.0.0",
    label,
    description: `${label} in the active target.`,
    category: "action",
    source: { kind: "importer", domainId: "example", packageId: "example.package", implementationKey: id },
    availability: { kind: "domain", domainId: "example" },
    requiredRuntimeCapabilities: ["example.actions"],
    capabilities: { executable: true, codeBacked: true },
    inputs: [{ id: "in", label: "In", valueType: "any", required: false }],
    outputs: [{ id: "success", label: "Success", valueType: "any" }],
    parameters: [{ id: "where", label: "Where", valueType: "string", required: false }],
    outputAction: { fixedOutputId: id }
  };
}

function nativeRuntime(): AutomationStudioNativeNodeRuntime {
  const succeed = () => ({ status: "success" as const, route: "success", outputs: { success: true } });
  return new AutomationStudioNativeNodeRuntime({ permissions: [], runtimeCapabilities: ["example.actions"] }).register({
    schemaVersion: "0.1",
    sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION,
    packageId: "example.package",
    packageVersion: "1.0.0",
    domainId: "example",
    nodes: [definition(OPEN_ID, "Open"), definition(SEARCH_ID, "Search")]
  }, {
    packageId: "example.package",
    packageVersion: "1.0.0",
    implementations: { [OPEN_ID]: succeed, [SEARCH_ID]: succeed }
  });
}

type World = Awaited<ReturnType<typeof createWorld>>;

/**
 * A service, its registry, a project and the extension's chat thread in it.
 * `unlocked` is what Secret Keys would say the person holds; the provider, like
 * the real one, refuses a call made for any other session.
 */
async function createWorld(options: { unlocked: string | null }) {
  const toolInputs: Array<Record<string, unknown>> = [];
  const resolutions: AutomationStudioLlmProviderResolverInput[] = [];
  const buildRequests: AutomationStudioLlmTaskRequest[] = [];
  const judgeAppliedCounts: number[] = [];
  let buildDecisions: Array<Record<string, unknown>> = [];
  let judgeAnswers: Array<"yes" | "no"> = [];
  // The test of the whole Flow runs its steps again through this, answered without reaching the page.
  const binding: AutomationStudioLlmEvidenceRuntimeBinding = automationStudioReplayingBinding({
    domainId: "example",
    deniedEvidenceKeys: [],
    tools: [{ toolId: "example.inspect", description: "Inspect what is in view.", inputSchema: { type: "object" }, effect: "observe", initialObservation: { input: {} } }],
    runsNodes: {},
    executeTool: async (input) => {
      toolInputs.push(input as unknown as Record<string, unknown>);
      const { toolId, value } = input;
      return toolId === "core.run_node"
        ? { kind: "llm_evidence_tool_execution" as const, evidence: { ran: String(value.node) }, effectApplied: true, draft: { actionId: String(value.node), input: value, proposes: true } }
        : { controls: [{ label: "Search" }] };
    }
  });
  const service = new AutomationStudioService({
    dataDir: path.join(tempRoot, "data"),
    seedFixture: false,
    llmProviderResolver: ((input: AutomationStudioLlmProviderResolverInput) => {
      resolutions.push(input);
      return {
        provider: {
          metadata: { provider: "mock-production", model: "mock-bootstrap" },
          runTask: async (request: AutomationStudioLlmTaskRequest) => {
            buildRequests.push(request);
            // The real provider releases the key to the caller's session per call (`session-key-provider.ts`).
            if (input.caller?.actorSessionId !== options.unlocked) throw new Error("Secret key session unlock is unavailable");
            // The judge of a build's test of the whole Flow: it says the Flow does what was asked, unless scripted otherwise.
            if (request.taskKind === "loop_verification") {
              const summaries = await service.listFlowAdaptationSummaries({ projectId: project.id, flowId: input.flowId!, limit: 50 }) as unknown as { adaptations?: Array<{ status: string }> };
              judgeAppliedCounts.push((summaries.adaptations ?? []).filter((entry) => entry.status === "applied").length);
              const answersRequest = judgeAnswers.shift() ?? "yes";
              const diagnosis = answersRequest === "yes" ? { answersRequest } : { answersRequest, observed: "The catalog was searched, but no kettle was read.", expected: "The kettles in the catalog." };
              return { response: { kind: "diagnosis", summary: "The Flow's test, judged.", diagnosis }, usage: { inputTokens: 40, outputTokens: 10, totalTokens: 50, estimatedCostUsd: 0.0005 } };
            }
            const latest = [...(request.context.evidenceLoop?.evidence ?? [])].reverse().find((entry) => entry.toolId === "core.submit_candidate")?.value as { revision?: number; digest?: string } | undefined;
            if (request.context.evidenceLoop?.tools.some((tool) => tool.toolId === "core.submit_candidate")) {
              const decision = latest?.digest ? { kind: "complete", result: { revision: latest.revision, digest: latest.digest } } : { kind: "tool_call", callId: "submit", toolId: "core.submit_candidate", input: { plan: plan(), summary: "Submitted draft" } };
              return { response: { kind: "evidence_tool_decision", summary: "Draft authoring", decision }, usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCostUsd: 0.001 } };
            }
            const decision = buildDecisions.shift() ?? { kind: "complete", result: { summary: "Search the catalog." } };
            return { response: { kind: "evidence_tool_decision", summary: "Working it out.", decision }, usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCostUsd: 0.001 } };
          }
        },
        // The real provider's window. Since t200 a request is never trimmed to
        // fit, so a smaller made-up window refuses the build's second decision
        // (`flow_bootstrap.pre_provider_request_total_exceeded`).
        tokenLimits: AUTOMATION_STUDIO_SESSION_KEY_PROVIDER_DEFAULTS.tokenLimits,
        maxCallsPerRun: 6,
        maxEstimatedCostUsd: 0.1,
        timeoutMs: 20_000
      };
    }) as never,
    llmEvidenceRuntime: binding
  });
  service.bindNativeNodeRuntime(nativeRuntime());
  service.conversations.bindUnlockedSessionResolver((userId) => (userId === PAIRED.userId ? options.unlocked : null));
  let chatAnswer: unknown = { reply: "Nothing to do." };
  service.conversations.bindModel({ name: "scripted", decide: async () => chatAnswer });
  const registry = new GlobalProgramApiRegistry();
  registerAutomationStudioApi(registry, service);

  const activity: ClientGatewayActivity[] = [];
  const stopActivity = automationStudioActivityHub.subscribe((event) => { activity.push(event); });
  const project = await service.createProject({ name: "Extension chat", domainId: "example" });
  const call = async (endpoint: string, payload: Record<string, unknown>) => registry.call({ programId: "automation-studio", endpoint, scope: { domainId: "example" }, actor: PAIRED, payload });
  const opened = await call("open-conversation", { projectId: project.id });
  expect(opened.ok, opened.error).toBe(true);
  const conversationId = (opened.payload as { conversation: { conversationId: string } }).conversation.conversationId;

  return {
    service,
    registry,
    project,
    conversationId,
    toolInputs,
    resolutions,
    buildRequests,
    judgeAppliedCounts,
    activity,
    stopActivity,
    call,
    /** What the build's model will decide, in order; after them it completes. */
    scriptBuild(decisions: Array<Record<string, unknown>>) {
      buildDecisions = [...decisions];
    },
    /** What the judge answers to its next calls, in order; after them it says yes. */
    scriptJudge(answers: Array<"yes" | "no">) {
      judgeAnswers = [...answers];
    },
    /** One message from the extension's chat, read by the scripted chat model as `answer`. */
    async say(text: string, answer: unknown, onScreen: Record<string, string> = { pageUrl: PAGE }, conversation = conversationId) {
      chatAnswer = answer;
      const response = await call("append-turn", { projectId: project.id, conversationId: conversation, text, capabilities: EXTENSION_CAPABILITIES, onScreen });
      expect(response.ok, response.error).toBe(true);
      return (response.payload as { response: { decision: { kind: string }; execution: Record<string, unknown> | null } | null }).response;
    },
    async thread(conversation = conversationId) {
      const read = await call("get-conversation", { projectId: project.id, conversationId: conversation });
      expect(read.ok, read.error).toBe(true);
      return (read.payload as { conversation: { turns: Array<{ turnId: string; author: string; text: string; attachment: { kind: string; ref: string } | null; ask: { askId: string; status: string; answer?: { kind: string } | null } | null }> } }).conversation;
    }
  };
}

const SEARCH_THEN_COMPLETE = [
  { kind: "tool_call", callId: "call.search", toolId: "core.run_node", input: { node: SEARCH_ID, parameters: { where: "kettles" }, consequences: [] }, add: true },
  { kind: "complete", result: { summary: "Search the catalog for kettles." } }
];

/** The steps of the Flow's applied change: what the Flow now holds. Empty when nothing was applied. */
async function flowNodes(service: AutomationStudioService, projectId: string, flowId: string): Promise<string[]> {
  const page = await service.listFlowAdaptationSummaries({ projectId, flowId, limit: 50 }) as unknown as { adaptations?: Array<{ adaptationId: string; status: string }> };
  const applied = (page.adaptations ?? []).filter((entry) => entry.status === "applied");
  expect(applied.length, JSON.stringify(page)).toBeGreaterThan(0);
  expect(await service.getFlowRouter(projectId, flowId)).not.toBeNull();
  const nodes: string[] = [];
  for (const entry of applied) {
    const record = await service.getFlowBootstrapAdaptation(projectId, flowId, entry.adaptationId);
    nodes.push(...(record?.topology.subflows.flatMap((subflow) => subflow.graphFlow.nodes.map((node) => node.definitionId)) ?? []));
  }
  return nodes;
}

/** The project's one top-level Flow; a Flow's Subflows are Flows of their own in the catalog. */
async function onlyFlow(service: AutomationStudioService, projectId: string): Promise<{ flowId: string; name: string }> {
  const flows = (await service.listFlows(projectId)).filter((entry) => (entry.flow as { metadata?: { subflowGraph?: unknown } }).metadata?.subflowGraph !== true);
  expect(flows.map((entry) => entry.flow.name)).toHaveLength(1);
  return flows[0]!.flow;
}

function resultTurns(turns: Awaited<ReturnType<World["thread"]>>["turns"], capabilityId: string) {
  return turns.filter((turn) => turn.attachment?.kind === "panel-capability-result" && turn.attachment.ref === capabilityId);
}

describe("the extension's chat, end to end in Core", () => {
  it("says what an automation should do", async () => {
    world = await createWorld({ unlocked: UNLOCKED_SESSION });
    const flow = await world.service.createFlow({ projectId: world.project.id, name: "Kettles" });

    const response = await world.say("It should find kettles", { do: "flow.describe", with: { flowId: flow.flowId, instruction: "Find every kettle under 30 dollars." } });
    expect(response?.execution).toMatchObject({ capabilityId: "flow.describe", status: "done" });
    const page = await world.service.listFlowInstructionSummaries({ projectId: world.project.id, flowId: flow.flowId, status: "active" }) as unknown as { instructions: Array<{ instructionId: string }> };
    const bodies = await Promise.all(page.instructions.map(async (entry) => (await world!.service.getFlowInstruction(world!.project.id, entry.instructionId))?.body));
    expect(bodies).toContain("Find every kettle under 30 dollars.");
  }, 60_000);

  it("does not apply an explored creation while its adaptation carries a permission request", async () => {
    const calls: string[] = [];
    const result = await AUTOMATION_STUDIO_CONVERSATION_EXPLORE.run({
      projectId: "project.example", conversationId: "conversation.example", sessionId: UNLOCKED_SESSION, keyLocked: false, paired: true, startLocation: null,
      host: {
        async appendAutomationTurn() { throw new Error("Explore must return its pending-permission outcome without writing a turn itself"); },
        async pendingAsks() { return []; },
        async getAsk() { return null; }
      },
      port: { async call(endpoint: string) { calls.push(endpoint); return { ok: true, payload: { adaptation: { adaptationId: "adaptation.pending", status: "proposed", permissionRequest: { askId: "ask.pending" } } } }; } }
    }, { flowId: "flow.example" });
    expect(calls).toEqual(["generate-flow-bootstrap-adaptation"]);
    expect(result.status).toBe("failed");
  });

  it("runs an automation from its own chat, where \"run it\" means that automation", async () => {
    world = await createWorld({ unlocked: UNLOCKED_SESSION });
    world.scriptBuild(SEARCH_THEN_COMPLETE);
    await world.say("Find the kettles on this page", { do: "flow.createHere", with: { instruction: "Search the catalog for kettles." } });
    await automationStudioConversationCommandWork.idle();
    const flow = await onlyFlow(world.service, world.project.id);
    // The automations list opens the Flow's own thread.
    const opened = await world.call("open-conversation", { projectId: world.project.id, subjectKind: "flow", subjectId: flow.flowId });
    expect(opened.ok, opened.error).toBe(true);
    const flowThread = (opened.payload as { conversation: { conversationId: string } }).conversation.conversationId;

    const response = await world.say("run it", { do: "run.execute" }, { pageUrl: PAGE }, flowThread);
    expect(response?.execution).toMatchObject({ capabilityId: "run.execute", status: "started" });
    await automationStudioConversationCommandWork.idle();
    const [result] = resultTurns((await world.thread(flowThread)).turns, "run.execute");
    expect(result?.text).toMatch(/run/iu);
    const runs = await world.call("list-flow-runs", { projectId: world.project.id, flowId: flow.flowId, limit: 5 });
    expect(runs.ok, runs.error).toBe(true);
    expect(JSON.stringify(runs.payload)).toContain(flow.flowId);
  }, 90_000);

  it("answers the question waiting in the thread from what the person typed", async () => {
    world = await createWorld({ unlocked: UNLOCKED_SESSION });
    const asked = await world.service.conversations.appendAutomationTurn({
      projectId: world.project.id,
      conversationId: world.conversationId,
      text: "A robot check is showing. Solve it in the page, then tell me to carry on.",
      attachment: null,
      ask: {
        askId: "ask.robot-check.1",
        kind: "confirm",
        parks: false,
        timeoutMs: null,
        onTimeout: null,
        options: null,
        routes: null,
        consequences: [],
        missing: null,
        control: null,
        permissionRequest: null
      } as never
    });
    expect(asked.ask?.askId).toBe("ask.robot-check.1");

    const response = await world.say("yes, go ahead", { do: "ask.answer", with: { answer: "yes, go ahead" } });
    expect(response?.execution).toMatchObject({ capabilityId: "ask.answer", status: "done" });
    const ask = await world.service.conversations.getAsk({ projectId: world.project.id, askId: "ask.robot-check.1" });
    expect(ask?.status).not.toBe("pending");
    expect(ask?.answer?.kind).toBe("grant");
  }, 60_000);

  it("says the key is locked, and how far it got, when the person has no unlocked session", async () => {
    world = await createWorld({ unlocked: null });
    world.scriptBuild(SEARCH_THEN_COMPLETE);

    const response = await world.say("Find the kettles on this page", { do: "flow.createHere", with: { instruction: "Search the catalog for kettles." } });
    expect(response?.execution).toMatchObject({ capabilityId: "flow.createHere", status: "started" });
    await automationStudioConversationCommandWork.idle();
    const [result] = resultTurns((await world.thread()).turns, "flow.createHere");
    expect(result?.text).toMatch(/stopped because/u);
    // How far it got: the Flow it made, empty, never "created" as work done after a failed build.
    expect(result?.text).toMatch(/The Flow "[^"]+" has no steps yet, but it keeps your instruction, so you can build it again\./u);
    expect(result?.text).not.toMatch(/Before that I created the Flow/u);
    expect(result?.text).toMatch(/model key is locked/u);
  }, 60_000);
  it("actual registry chat creation saves a draft and leaves accepted topology unchanged", async () => {
    world = await createWorld({ unlocked: UNLOCKED_SESSION });
    await world.say("Create a flow that finds products", { do: "flow.createHere", with: { instruction: "Find products", name: "Draft" } });
    await automationStudioConversationCommandWork.idle();
    const flow = await onlyFlow(world.service, world.project.id);
    expect(await world.service.getFlowRouter(world.project.id, flow.flowId)).toBeNull();
    expect((await world.service.getFlow(world.project.id, flow.flowId)).nodes).toEqual([]);
    expect((await world.service.listFlowAdaptationSummaries({ projectId: world.project.id, flowId: flow.flowId, limit: 50 })).adaptations).toEqual([]);
    const turns = (await world.thread()).turns;
    expect(turns.filter((turn) => turn.ask)).toEqual([]);
    expect(turns.some((turn) => turn.attachment?.kind === "candidate-draft")).toBe(true);
    expect(turns.map((turn) => turn.text).join(" ")).toContain("Verification pending");
    expect(world.buildRequests.some((request) => request.taskKind === "loop_verification")).toBe(false);
    const original = await world.service.getFlowInstructionSet({ projectId: world.project.id, flowId: flow.flowId });
    const flowCount = (await world.service.listFlows(world.project.id)).length;
    await world.say("Continue building it", { do: "flow.explore", with: { flowId: flow.flowId } });
    await automationStudioConversationCommandWork.idle();
    expect((await world.service.listFlows(world.project.id)).length).toBe(flowCount);
    expect(await world.service.getFlowInstructionSet({ projectId: world.project.id, flowId: flow.flowId })).toEqual(original);
    expect(await world.service.getFlowRouter(world.project.id, flow.flowId)).toBeNull();
    expect((await world.thread()).turns.filter((turn) => turn.attachment?.kind === "candidate-draft")).toHaveLength(2);

  }, 60_000);

  it.each([PAGE, "http://127.0.0.1:4100/private?token=sensitive"])("candidate announcement masks address %s", async (page) => {
    world = await createWorld({ unlocked: UNLOCKED_SESSION });
    await world.say("Create an automation", { do: "flow.createHere", with: { instruction: "Find products", name: "Draft" } }, { pageUrl: page });
    await automationStudioConversationCommandWork.idle();
    const text = (await world.thread()).turns.filter((turn) => turn.author === "automation").map((turn) => turn.text).join(" ");
    expect(text).not.toContain(page); expect(text).not.toContain("token=sensitive");
    expect(text).toContain(page === PAGE ? "shop.example.test" : "the page you had open");
    expect(text).toContain("Verification pending");
  }, 60_000);

});
