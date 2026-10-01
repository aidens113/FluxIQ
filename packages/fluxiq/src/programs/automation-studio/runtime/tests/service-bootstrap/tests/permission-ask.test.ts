// The question a build raises reaches a person, and their answer is what
// releases it.
//
// The gate has always built a request; the conversation has always had a
// `permission` ask keyed by that request's own `requestId`. Nothing joined
// them, so a build that met an action it was not permitted refused it, ended,
// and left a request nobody was shown. These drive the real
// `generateFlowBootstrapAdaptation` against a real conversation store and read
// the thread back.

import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioActionConsequence } from "../../../action-permissions/index.ts";
import { automationStudioActivityHub } from "../../../activity/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding } from "../../../llm/index.ts";
import { AutomationStudioService } from "../../../service.ts";
import { blankFixture, caller, mockProvider, plan, copyDataDirSeed, seedDataDir, type DataDirSeed } from "./fixtures.ts";

const REFUND: AutomationStudioActionConsequence[] = ["move_money", "modify_existing"];
/**
 * Of what the press declares, the part a person is asked about. Since
 * 2026-09-26 that is the money alone: an edit is not gated, and the request
 * still carries both classes while asking only about this one.
 */
const ASKED_ABOUT: AutomationStudioActionConsequence[] = ["move_money"];

let tempRoot: string;
type Fixture = Awaited<ReturnType<typeof blankFixture>>;

// Every case needs a blank project. Writing one through the service costs about a
// second on an idle machine and several under load, inside each case's 15 s budget,
// so it is written once per file by a closed service and each case runs on its own copy.
const SEEDING_TIMEOUT_MS = 60_000;
let seedRoot: string;
/** One blank `example`-domain project. */
let example: DataDirSeed<Fixture>;

/** Copies a seed into this case's data directory; call it before any service there is constructed. */
async function seeded<T>(seed: DataDirSeed<T>): Promise<T> {
  return structuredClone(await copyDataDirSeed(seed, tempRoot));
}

const services = new Set<AutomationStudioService>();
let activity: ClientGatewayActivity[] = [];
let unsubscribe: () => void = () => undefined;

/** The build's ask rows, as [phase, ref, status, resolution]. */
function askRows(): unknown[][] {
  return activity.filter((event) => event.detail?.kind === "ask").map((event) => [event.phase, event.detail!.ref, event.detail!.status, event.detail!.resolution]);
}

beforeAll(async () => {
  seedRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-flow-bootstrap-seed-"));
  example = await seedDataDir(path.join(seedRoot, "example"), (instance) => blankFixture(instance, "active", "example"));
}, SEEDING_TIMEOUT_MS);

afterAll(async () => {
  if (seedRoot) await rm(seedRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-bootstrap-ask-"));
  activity = [];
  unsubscribe = automationStudioActivityHub.subscribe((event) => activity.push(event));
});

afterEach(async () => {
  unsubscribe();
  await Promise.all([...services].map((instance) => instance.close()));
  services.clear();
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

describe("a build that needs permission asks for it in the Flow's thread", () => {
  it("opens the ask under the request's own id, carries on, and is held until the answer is a grant", async () => {
    const run = await build();
    const result = await run.generation;

    // The action was refused, and the build still produced a Flow.
    expect(run.acted).toEqual([]);
    expect(result.status).toBe("proposed");
    const requestId = result.permissionRequest!.requestId;

    // The question is in the thread, keyed by the request, with the request on it.
    const ask = await run.instance.conversations.getAsk({ projectId: run.project.id, askId: requestId });
    expect(ask).toMatchObject({
      askId: requestId,
      kind: "permission",
      parks: true,
      status: "pending",
      missing: ASKED_ABOUT,
      permissionRequest: { requestId, action: { kind: "exploration_step" } }
    });
    // The turn the question hangs on says it in Core's own words.
    const thread = await run.instance.conversations.getConversation({ projectId: run.project.id, conversationId: ask!.conversationId });
    expect(thread!.turns.find((turn) => turn.ask?.askId === requestId)?.text).toBe(result.permissionRequest!.sentence);

    // Unanswered, nothing may be approved.
    const approve = { projectId: run.project.id, flowId: run.flow.flowId, adaptationId: result.adaptationId, action: "approve" as const };
    await expect(run.instance.reviewFlowBootstrapAdaptation(approve)).rejects.toThrow(/has not been answered/);

    // A refusal holds it just the same, and says so differently.
    await run.instance.conversations.answerAsk({ projectId: run.project.id, askId: requestId, kind: "deny" });
    await expect(run.instance.reviewFlowBootstrapAdaptation(approve)).rejects.toThrow(/was refused/);
    // The build did not wait on the question, so it said no wait and no resolution.
    expect(askRows()).toEqual([]);
  });

  it("goes ahead with the action when the person grants it while the build waits", async () => {
    const run = await build({ waitMs: 30_000 });
    // The build is parked inside the refused call; the answer is what frees it.
    const answered = (async () => {
      for (let attempt = 0; attempt < 300; attempt += 1) {
        const [conversation] = await run.instance.conversations.listConversations({ projectId: run.project.id, subject: { kind: "flow", id: run.flow.flowId } });
        const thread = conversation ? await run.instance.conversations.getConversation({ projectId: run.project.id, conversationId: conversation.conversationId }) : null;
        const askId = thread?.turns.find((turn) => turn.ask)?.ask?.askId;
        if (askId) return await run.instance.conversations.answerAsk({ projectId: run.project.id, askId, kind: "grant" });
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error("The build never asked for permission.");
    })();
    const result = await run.generation;
    await answered;

    // Granted, the same action ran, and the proposal carries no outstanding request.
    expect(run.acted).toEqual(["refund"]);
    expect(result.status).toBe("proposed");
    expect(result.permissionRequest).toBeUndefined();
    await expect(run.instance.reviewFlowBootstrapAdaptation({ projectId: run.project.id, flowId: run.flow.flowId, adaptationId: result.adaptationId, action: "approve" })).resolves.toMatchObject({ status: "validated" });
    // The wait, keyed by the request, and its one resolution.
    const requestId = (await answered).askId;
    expect(askRows()).toEqual([
      ["waiting_permission", requestId, "started", undefined],
      ["building", requestId, "succeeded", "allowed"]
    ]);
  }, 30_000);

  // A person's no was once the end of every question in the build: the first
  // ask set a build-wide flag, and the declined request refused every later
  // press with its own id. Live, a no to "Continue to checkout" meant "Place
  // order" was never asked about (t195-w18).
  it("asks about another control after the person declines one, and presses it once granted", async () => {
    const run = await checkoutBuild();
    const answered = answerEach(run, ["deny", "grant"]);
    const result = await run.generation;
    const [declinedId, grantedId] = await answered;

    expect(run.acted).toEqual(["Place order"]);
    expect(result.status).toBe("proposed");
    expect(result.permissionRequest).toBeUndefined();
    expect(declinedId).not.toBe(grantedId);
    expect(askRows()).toEqual([
      ["waiting_permission", declinedId, "started", undefined],
      ["building", declinedId, "failed", "declined"],
      ["waiting_permission", grantedId, "started", undefined],
      ["building", grantedId, "succeeded", "allowed"]
    ]);
  }, 30_000);
});

/** A build that presses "Continue to checkout" and then "Place order", each declaring money. */
async function checkoutBuild() {
  const acted: string[] = [];
  const decisions: JsonObject[] = [
    { kind: "tool_call", callId: "call.checkout", toolId: "example.act", input: { control: "Continue to checkout" } },
    { kind: "tool_call", callId: "call.place", toolId: "example.act", input: { control: "Place order" } },
    { kind: "complete", result: { summary: "Built.", plan: plan() } }
  ];
  let call = 0;
  const provider = mockProvider(async (request) => ({
    // The instruction is read once for what it asks for, with no tools; that
    // call must not use up one of the model's decisions.
    response: request.context.evidenceLoop?.tools.length === 0
      ? { kind: "evidence_tool_decision", summary: "Read the instruction.", decision: { kind: "complete", result: { instructed: [] } } }
      : { kind: "evidence_tool_decision", summary: "Step.", decision: decisions[Math.min(call++, decisions.length - 1)]! },
    usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCostUsd: 0.001 }
  }));
  const binding: AutomationStudioLlmEvidenceRuntimeBinding = {
    domainId: "example",
    deniedEvidenceKeys: [],
    tools: [{ toolId: "example.act", description: "Press a control.", inputSchema: { type: "object" }, effect: "mutate" }],
    executeTool: async (input) => {
      const name = String(input.value.control);
      const verdict = await input.permission({ consequences: ["move_money"], control: { name, kind: "button" }, verb: "press" });
      if (!verdict.permitted) return { kind: "llm_evidence_tool_execution", evidence: { ok: false, code: "permission_required" }, effectApplied: false, resultCode: "example.permission_required" };
      acted.push(name);
      return { kind: "llm_evidence_tool_execution", evidence: { pressed: name }, effectApplied: true };
    }
  };
  const { project, flow } = await seeded(example);
  const instance = new AutomationStudioService({ dataDir: tempRoot, llmProviderResolver: (() => ({ provider, maxCallsPerRun: 6 })) as never, llmEvidenceRuntime: binding });
  services.add(instance);
  const generation = instance.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, evidenceGuided: true, caller: caller(), permissionAskTimeoutMs: 30_000 });
  return { instance, project, flow, acted, generation };
}

/** Answers each permission ask the build opens, in the order it opens them, and returns their ids. */
async function answerEach(run: Awaited<ReturnType<typeof checkoutBuild>>, kinds: Array<"grant" | "deny">): Promise<string[]> {
  const answered: string[] = [];
  // A build that stops asking ends the wait for its next question too.
  let over = false;
  void run.generation.then(() => { over = true; }, () => { over = true; });
  for (let attempt = 0; attempt < 600 && answered.length < kinds.length && !over; attempt += 1) {
    const [conversation] = await run.instance.conversations.listConversations({ projectId: run.project.id, subject: { kind: "flow", id: run.flow.flowId } });
    const thread = conversation ? await run.instance.conversations.getConversation({ projectId: run.project.id, conversationId: conversation.conversationId }) : null;
    for (const turn of thread?.turns ?? []) {
      const askId = turn.ask?.kind === "permission" ? turn.ask.askId : undefined;
      if (!askId || answered.includes(askId) || answered.length >= kinds.length) continue;
      await run.instance.conversations.answerAsk({ projectId: run.project.id, askId, kind: kinds[answered.length]! });
      answered.push(askId);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (answered.length < kinds.length) throw new Error(`The build asked ${answered.length} of the ${kinds.length} expected questions.`);
  return answered;
}

describe("a build that never explored", () => {
  // The one-call path resolved its plan with no gate behind it, so every step
  // that declared anything lasting was refused by
  // `automationStudioActionPermissionDenied` with no request and nobody asked:
  // fail-closed, but silently, and the only answer that let such a build finish
  // was the empty declaration. It goes through the same gate now.
  it("asks for its plan's permission too, rather than refusing with nobody to ask", async () => {
    const asked: string[] = [];
    const { project, flow } = await seeded(example);
    const instance = new AutomationStudioService({
      dataDir: tempRoot,
      llmProviderResolver: (() => ({ provider: mockProvider(), maxCallsPerRun: 2 })) as never,
      llmEvidenceRuntime: {
        domainId: "example",
        deniedEvidenceKeys: [],
        tools: [],
        executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: {}, effectApplied: false }),
        // The stand-in domain says one of the plan's steps would refund. Which
        // node it is does not matter here; that a plan step can say so, and be
        // asked about, does.
        resolvePlanNodeParameters: async ({ nodeDefinitionId, permission }) => {
          if (nodeDefinitionId !== "builtin.control.end") return { status: "unchanged" };
          const verdict = await permission({ consequences: REFUND, control: { name: "Refund line 1", kind: "button" }, verb: "press" });
          asked.push(verdict.permitted ? "permitted" : "refused");
          return verdict.permitted ? { status: "unchanged" } : { status: "refused", issueCodes: ["example.permission_required"] };
        }
      } satisfies AutomationStudioLlmEvidenceRuntimeBinding
    });
    services.add(instance);

    // No `evidenceGuided`: one call, a whole plan, nothing explored.
    await expect(instance.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, caller: caller() }))
      .rejects.toThrow("Flow Bootstrap generation failed (flow_bootstrap.permission_required).");
    expect(asked).toEqual(["refused"]);

    // And the question reached the thread, where before there was none to reach.
    const [conversation] = await instance.conversations.listConversations({ projectId: project.id, subject: { kind: "flow", id: flow.flowId } });
    const thread = await instance.conversations.getConversation({ projectId: project.id, conversationId: conversation!.conversationId });
    expect(thread!.turns.find((turn) => turn.ask)?.ask).toMatchObject({ kind: "permission", missing: ASKED_ABOUT, permissionRequest: { action: { kind: "flow_step" } } });
  });
});

/** One build whose model runs an action with a lasting consequence, then completes. */
async function build(options: { waitMs?: number } = {}) {
  const acted: string[] = [];
  const decisions: JsonObject[] = [
    { kind: "tool_call", callId: "call.refund", toolId: "example.act", input: {} },
    { kind: "complete", result: { summary: "Built.", plan: plan() } }
  ];
  let call = 0;
  const provider = mockProvider(async () => ({
    response: { kind: "evidence_tool_decision", summary: "Step.", decision: decisions[Math.min(call++, decisions.length - 1)]! },
    usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCostUsd: 0.001 }
  }));
  const binding: AutomationStudioLlmEvidenceRuntimeBinding = {
    domainId: "example",
    deniedEvidenceKeys: [],
    tools: [{ toolId: "example.act", description: "Refund a line.", inputSchema: { type: "object" }, effect: "mutate" }],
    executeTool: async (input) => {
      const verdict = await input.permission({ consequences: REFUND, control: { name: "Refund line 1", kind: "button" }, verb: "press" });
      if (!verdict.permitted) return { kind: "llm_evidence_tool_execution", evidence: { ok: false, code: "permission_required" }, effectApplied: false, resultCode: "example.permission_required" };
      acted.push("refund");
      return { kind: "llm_evidence_tool_execution", evidence: { refunded: true }, effectApplied: true };
    }
  };
  const { project, flow } = await seeded(example);
  const instance = new AutomationStudioService({
    dataDir: tempRoot,
    llmProviderResolver: (() => ({ provider, maxCallsPerRun: 6 })) as never,
    llmEvidenceRuntime: binding
  });
  services.add(instance);
  // The control's name has to have been shown before a request may carry it.
  const generation = instance.generateFlowBootstrapAdaptation({
    projectId: project.id, flowId: flow.flowId, evidenceGuided: true, caller: caller(),
    ...(options.waitMs === undefined ? {} : { permissionAskTimeoutMs: options.waitMs })
  });
  return { instance, project, flow, acted, generation };
}
