// A build that meets a check only a person can get past hands it to the person,
// in the Flow's thread, and never shows the model the check.
//
// These drive the real `generateFlowBootstrapAdaptation` against a real
// conversation store, a scripted provider and a stand-in domain whose action
// lands on a check, and read back the thread, every request the model was sent,
// the stored trace and the live activity. The wrapper's own outcomes are
// `../../../flow-bootstrap/tests/person-needed.test.ts`.

import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { automationStudioActivityHub } from "../../../activity/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding } from "../../../llm/index.ts";
import { AUTOMATION_STUDIO_PERSON_NEEDED_TEXT, type AutomationStudioParkingPort } from "../../../parking/index.ts";
import { AutomationStudioService } from "../../../service.ts";
import { automationStudioReplayingBinding } from "../../replaying-binding.ts";
import { blankFixture, caller, isJudgeRequest, judgeReply, mockProvider, plan, rejectedGenerationDiagnostic, copyDataDirSeed, seedDataDir, type DataDirSeed } from "./fixtures.ts";

/** Only the domain's account of the check carries this; the model must never be sent it. */
const CHECK_MARKER = "CHECK-ONLY-A-PERSON-CAN-PASS";

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

beforeAll(async () => {
  seedRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-bootstrap-person-seed-"));
  example = await seedDataDir(path.join(seedRoot, "example"), (instance) => blankFixture(instance, "active", "example"));
}, SEEDING_TIMEOUT_MS);

afterAll(async () => {
  if (seedRoot) await rm(seedRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-bootstrap-person-"));
  activity = [];
  unsubscribe = automationStudioActivityHub.subscribe((event) => activity.push(event));
});

afterEach(async () => {
  unsubscribe();
  await Promise.all([...services].map((instance) => instance.close()));
  services.clear();
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

describe("a build whose step lands on a check only a person can get past", () => {
  it("waits for the person, and on Continue goes on from a fresh look with the step kept", async () => {
    const run = await build();
    const answered = answerWhenAsked(run, "person_done");
    const result = await run.generation;
    const ask = await answered;

    expect(result.status).toBe("proposed");
    // The question went to the Flow's thread, in the contract's words, and was answered.
    expect(ask).toMatchObject({ kind: "choice", parks: true, status: "answered", control: { kind: "person_check" }, answer: { kind: "choice", value: "person_done" } });
    // The model never saw the check, and the decision after the answer was shown the person's clearing and a fresh look.
    expect(run.requests.some((request) => request.includes(CHECK_MARKER))).toBe(false);
    // Two decisions, then the judge of the Flow's test.
    expect(run.requests).toHaveLength(3);
    expect(run.requests[1]).toContain("personCompletedCheck");
    expect(run.requests[1]).toContain("the list, after the check");
    expect(run.requests[2]).toContain("\"taskKind\":\"loop_verification\"");
    // The look ran once at the start and once after the person, and the act was not run again.
    expect(run.calls).toEqual(["example.look", "example.act", "example.look"]);
    // The step stands: it applied, and it carries no failure code.
    const stored = await run.instance.getFlowBootstrapAdaptation(run.project.id, run.flow.flowId, result.adaptationId);
    const acted = stored!.evidenceTrace?.find((step) => step.toolId === "example.act");
    expect(acted).toMatchObject({ effectApplied: true });
    expect(acted?.resultCode).toBeUndefined();
    // While it waited, the build said so in the check's own words.
    expect(activity.find((event) => event.phase === "waiting_permission")).toMatchObject({ label: AUTOMATION_STUDIO_PERSON_NEEDED_TEXT, detail: { kind: "ask", status: "started" } });
    // The wait is over when the person answers, and the build says so once, on the same ask.
    expect(askRows()).toEqual([
      ["waiting_permission", ask!.askId, "started", undefined],
      ["building", ask!.askId, "succeeded", "answered"]
    ]);
    expect(activity.some((event) => event.detail?.title === "Check completed by the person")).toBe(false);
  }, 30_000);

  it("ends user_intervention_required when the person presses Stop, and never asks the model again", async () => {
    const run = await build();
    const answered = answerWhenAsked(run, "person_stop");
    const diagnostic = await rejectedGenerationDiagnostic(run.generation);
    await answered;

    expect(diagnostic).toMatchObject({ code: "flow_bootstrap.user_intervention_required", retryable: false, issueCodes: ["person_needed.stopped"] });
    expect(run.requests).toHaveLength(1);
    expect(run.requests.some((request) => request.includes(CHECK_MARKER))).toBe(false);
    expect(run.calls).toEqual(["example.look", "example.act"]);
    expect(askRows().map((row) => row.slice(2))).toEqual([["started", undefined], ["failed", "declined"]]);
  }, 30_000);

  it("ends user_intervention_required when nobody answers in time", async () => {
    const run = await build({
      // A thread whose wait runs out at once: what the real one does after five minutes.
      port: (real) => ({ open: (ask) => real.open(ask), awaitAnswer: async () => undefined })
    });
    const diagnostic = await rejectedGenerationDiagnostic(run.generation);
    expect(diagnostic).toMatchObject({ code: "flow_bootstrap.user_intervention_required", issueCodes: ["person_needed.timed_out"] });
    expect(run.requests).toHaveLength(1);
    expect(askRows().map((row) => row.slice(2))).toEqual([["started", undefined], ["failed", "timed_out"]]);
  }, 30_000);

  it("ends user_intervention_required at once when there is no thread to ask in", async () => {
    const run = await build({ noThread: true });
    const diagnostic = await rejectedGenerationDiagnostic(run.generation);
    expect(diagnostic).toMatchObject({ code: "flow_bootstrap.user_intervention_required", issueCodes: ["person_needed.no_thread"] });
    expect(run.requests).toHaveLength(1);
    expect(run.requests.some((request) => request.includes(CHECK_MARKER))).toBe(false);
    // Nobody was asked, so there was no wait to say.
    expect(askRows()).toEqual([]);
  }, 30_000);
});

/** The build's ask rows, as [phase, ref, status, resolution]. */
function askRows(): unknown[][] {
  return activity.filter((event) => event.detail?.kind === "ask").map((event) => [event.phase, event.detail!.ref, event.detail!.status, event.detail!.resolution]);
}

type Run = Awaited<ReturnType<typeof build>>;

/** Plays the person: waits for the question to reach the thread, then answers it. */
async function answerWhenAsked(run: Run, value: "person_done" | "person_stop") {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const [conversation] = await run.instance.conversations.listConversations({ projectId: run.project.id, subject: { kind: "flow", id: run.flow.flowId } });
    const thread = conversation ? await run.instance.conversations.getConversation({ projectId: run.project.id, conversationId: conversation.conversationId }) : null;
    const askId = thread?.turns.find((turn) => turn.ask)?.ask?.askId;
    if (askId) {
      await run.instance.conversations.answerAsk({ projectId: run.project.id, askId, kind: "choice", value });
      return await run.instance.conversations.getAsk({ projectId: run.project.id, askId });
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("The build never asked the person.");
}

/** One build: a free look, an action that lands on a check, then a completion; the judge of its test says yes. */
async function build(options: { noThread?: boolean; port?: (real: AutomationStudioParkingPort) => AutomationStudioParkingPort } = {}) {
  const requests: string[] = [];
  const calls: string[] = [];
  const decisions: JsonObject[] = [
    // Added to the Flow as it runs (`add`): a Flow is made of the steps that ran in its build, which its test runs whole.
    { kind: "tool_call", callId: "call.open", toolId: "example.act", input: {}, add: true },
    { kind: "complete", result: { summary: "Built.", plan: plan() } }
  ];
  let decision = 0;
  const provider = mockProvider(async (request) => {
    requests.push(JSON.stringify(request));
    if (isJudgeRequest(request)) return judgeReply();
    return {
      response: { kind: "evidence_tool_decision", summary: "Step.", decision: decisions[Math.min(decision++, decisions.length - 1)]! },
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCostUsd: 0.001 }
    };
  });
  let acted = false;
  const binding: AutomationStudioLlmEvidenceRuntimeBinding = {
    domainId: "example",
    deniedEvidenceKeys: [],
    tools: [
      { toolId: "example.look", description: "Look at the target.", inputSchema: { type: "object" }, effect: "observe", initialObservation: { input: {} } },
      { toolId: "example.act", description: "Open the list.", inputSchema: { type: "object" }, effect: "mutate" }
    ],
    executeTool: async (input) => {
      calls.push(input.toolId);
      if (input.toolId === "example.look") {
        return { kind: "llm_evidence_tool_execution", evidence: { saw: acted ? "the list, after the check" : "the start" }, effectApplied: false };
      }
      acted = true;
      // The domain's own account: the navigation happened, and a check stands in front of the list.
      return { kind: "llm_evidence_tool_execution", evidence: { ok: false, code: "USER_INTERVENTION_REQUIRED", note: CHECK_MARKER }, effectApplied: true, resultCode: "example.user_intervention_required", personNeeded: true };
    }
  };
  const { project, flow } = await seeded(example);
  const instance = new AutomationStudioService({
    dataDir: tempRoot,
    llmProviderResolver: (() => ({ provider, maxCallsPerRun: 6 })) as never,
    // Said how to run its steps again, so the build's test can run the Flow whole; its replay calls never reach `calls`.
    llmEvidenceRuntime: automationStudioReplayingBinding(binding)
  });
  services.add(instance);
  if (options.noThread) (instance.conversations as { available: boolean }).available = false;
  if (options.port) {
    const conversations = instance.conversations;
    const real = conversations.parkingPort.bind(conversations);
    conversations.parkingPort = (input) => options.port!(real(input));
  }
  const generation = instance.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, evidenceGuided: true, caller: caller() });
  return { instance, project, flow, requests, calls, generation };
}
