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
import { automationStudioConversationCommandWork } from "../index.ts";

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
  let buildDecisions: Array<Record<string, unknown>> = [];
  const binding: AutomationStudioLlmEvidenceRuntimeBinding = {
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
  };
  const service = new AutomationStudioService({
    dataDir: path.join(tempRoot, "data"),
    seedFixture: false,
    llmProviderResolver: ((input: AutomationStudioLlmProviderResolverInput) => {
      resolutions.push(input);
      return {
        provider: {
          metadata: { provider: "mock-production", model: "mock-bootstrap" },
          runTask: async (_request: AutomationStudioLlmTaskRequest) => {
            // The real provider releases the key to the caller's session per call (`session-key-provider.ts`).
            if (input.caller?.actorSessionId !== options.unlocked) throw new Error("Secret key session unlock is unavailable");
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
    activity,
    stopActivity,
    call,
    /** What the build's model will decide, in order; after them it completes. */
    scriptBuild(decisions: Array<Record<string, unknown>>) {
      buildDecisions = [...decisions];
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
  it("creates an automation from the page the person is on, builds it by exploring, and puts the steps into it", async () => {
    world = await createWorld({ unlocked: UNLOCKED_SESSION });
    world.scriptBuild(SEARCH_THEN_COMPLETE);

    const response = await world.say("Find the kettles on this page", { do: "flow.createHere", with: { instruction: "Search the catalog for kettles." } });
    expect(response?.decision.kind).toBe("invoke");
    expect(response?.execution).toMatchObject({ capabilityId: "flow.createHere", status: "started" });
    await automationStudioConversationCommandWork.idle();
    expect(automationStudioConversationCommandWork.takeUnreported()).toEqual([]);

    const flow = await onlyFlow(world.service, world.project.id);
    expect(await flowNodes(world.service, world.project.id, flow.flowId)).toContain(SEARCH_ID);
    // The build started from the page the person had open, and ran on their unlocked session, not the token's.
    expect(world.toolInputs.some((input) => input.startLocation === PAGE)).toBe(true);
    expect(world.resolutions.map((entry) => entry.caller?.actorSessionId)).toEqual(world.resolutions.map(() => UNLOCKED_SESSION));
    const thread = await world.thread();
    const [result] = resultTurns(thread.turns, "flow.createHere");
    expect(result?.text).toMatch(/Created the Flow/u);
    // What the build did was shown in this chat.
    const built = world.activity.filter((event) => event.subject.kind === "build");
    expect(built.length).toBeGreaterThan(0);
    expect(built.every((event) => event.conversationId === world!.conversationId)).toBe(true);
  }, 60_000);

  it("builds from a job the person only described, taking their message as what the automation should do", async () => {
    world = await createWorld({ unlocked: UNLOCKED_SESSION });
    world.scriptBuild(SEARCH_THEN_COMPLETE);
    const message = "Find every kettle in the catalog that costs under 30 dollars";

    // The model named the capability and left its instruction out, as the person's own message already says it.
    const response = await world.say(message, { do: "flow.createHere" });
    expect(response?.decision.kind).toBe("invoke");
    expect(response?.execution).toMatchObject({ capabilityId: "flow.createHere", status: "started" });
    await automationStudioConversationCommandWork.idle();
    expect(automationStudioConversationCommandWork.takeUnreported()).toEqual([]);

    const flow = await onlyFlow(world.service, world.project.id);
    expect(await flowNodes(world.service, world.project.id, flow.flowId)).toContain(SEARCH_ID);
    const page = await world.service.listFlowInstructionSummaries({ projectId: world.project.id, flowId: flow.flowId, status: "active" }) as unknown as { instructions: Array<{ instructionId: string }> };
    const bodies = await Promise.all(page.instructions.map(async (entry) => (await world!.service.getFlowInstruction(world!.project.id, entry.instructionId))?.body));
    expect(bodies).toEqual([message]);
    const [result] = resultTurns((await world.thread()).turns, "flow.createHere");
    expect(result?.text).toMatch(/Created the Flow/u);
  }, 60_000);

  it("says what an automation should do", async () => {
    world = await createWorld({ unlocked: UNLOCKED_SESSION });
    const flow = await world.service.createFlow({ projectId: world.project.id, name: "Kettles" });

    const response = await world.say("It should find kettles", { do: "flow.describe", with: { flowId: flow.flowId, instruction: "Find every kettle under 30 dollars." } });
    expect(response?.execution).toMatchObject({ capabilityId: "flow.describe", status: "done" });
    const page = await world.service.listFlowInstructionSummaries({ projectId: world.project.id, flowId: flow.flowId, status: "active" }) as unknown as { instructions: Array<{ instructionId: string }> };
    const bodies = await Promise.all(page.instructions.map(async (entry) => (await world!.service.getFlowInstruction(world!.project.id, entry.instructionId))?.body));
    expect(bodies).toContain("Find every kettle under 30 dollars.");
  }, 60_000);

  it("explores and builds a blank automation it is told about, and applies it", async () => {
    world = await createWorld({ unlocked: UNLOCKED_SESSION });
    const flow = await world.service.createFlow({ projectId: world.project.id, name: "Kettles" });
    world.scriptBuild(SEARCH_THEN_COMPLETE);

    const response = await world.say("Build it by trying it here", { do: "flow.explore", with: { flowId: flow.flowId, instruction: "Search the catalog for kettles." } });
    expect(response?.execution).toMatchObject({ capabilityId: "flow.explore", status: "started" });
    await automationStudioConversationCommandWork.idle();
    expect(await flowNodes(world.service, world.project.id, flow.flowId)).toContain(SEARCH_ID);
    expect(resultTurns((await world.thread()).turns, "flow.explore")[0]?.text).not.toMatch(/stopped because/u);
  }, 60_000);

  it("improves an automation, asks before applying, sets the change aside on no and applies it on yes", async () => {
    world = await createWorld({ unlocked: UNLOCKED_SESSION });
    world.scriptBuild(SEARCH_THEN_COMPLETE);
    await world.say("Find the kettles on this page", { do: "flow.createHere", with: { instruction: "Search the catalog for kettles." } });
    await automationStudioConversationCommandWork.idle();
    const flow = await onlyFlow(world.service, world.project.id);

    const improveOnce = async () => {
      world!.scriptBuild([{ kind: "complete", result: { summary: "Search, then open the first kettle." } }]);
      const response = await world!.say("It should also open the first kettle", { do: "flow.improve", with: { flowId: flow.flowId, change: "Also open the first kettle." } });
      expect(response?.execution).toMatchObject({ capabilityId: "flow.improve", status: "started" });
      await automationStudioConversationCommandWork.idle();
      const pending = (await world!.thread()).turns.filter((turn) => turn.ask?.status === "pending" && turn.ask.askId.startsWith("conversation-command."));
      expect(pending, JSON.stringify(resultTurns((await world!.thread()).turns, "flow.improve").map((turn) => turn.text))).toHaveLength(1);
      const ref = JSON.parse(Buffer.from(pending[0]!.attachment!.ref, "base64url").toString("utf8")) as { arguments: { adaptationId: string } };
      return { askId: pending[0]!.ask!.askId, adaptationId: ref.arguments.adaptationId };
    };

    const declined = await improveOnce();
    const deny = await world.call("answer-ask", { projectId: world.project.id, askId: declined.askId, kind: "deny" });
    expect(deny.ok, deny.error).toBe(true);
    expect((deny.payload as { execution: Record<string, unknown> | null }).execution).toMatchObject({ capabilityId: "adaptation.reject", status: "done" });
    // Rejected rather than left waiting: a change left waiting would refuse the next improvement (`pending_adaptation_exists`).
    expect((await world.service.getFlowBootstrapAdaptation(world.project.id, flow.flowId, declined.adaptationId))!.status).toBe("rejected");

    const accepted = await improveOnce();
    const grant = await world.call("answer-ask", { projectId: world.project.id, askId: accepted.askId, kind: "grant" });
    expect(grant.ok, grant.error).toBe(true);
    expect((grant.payload as { execution: Record<string, unknown> | null }).execution).toMatchObject({ status: "done" });
    expect((await world.service.getFlowBootstrapAdaptation(world.project.id, flow.flowId, accepted.adaptationId))!.status).toBe("applied");
  }, 90_000);

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
    expect(result?.text).toMatch(/created the Flow/u);
    expect(result?.text).toMatch(/model key is locked/u);
  }, 60_000);
});
