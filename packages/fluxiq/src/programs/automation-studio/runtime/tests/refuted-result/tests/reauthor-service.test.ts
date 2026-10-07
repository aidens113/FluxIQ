import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { IoRegistry } from "../../../../../../io/index.ts";
import {
  AUTOMATION_STUDIO_IMPORTER_SDK_VERSION,
  type AutomationStudioNodeDefinition,
} from "../../../../nodes/index.ts";
import { AUTOMATION_STUDIO_RUNTIME_SESSION_LLM_INTENTS, createAutomationStudioSessionKeyProviderResolver, type AutomationStudioRuntimeSessionLlmIntent } from "../../../llm/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../native-node-runtime.ts";
import {
  AutomationStudioService,
  type AutomationStudioLlmProviderResolverInput,
} from "../../../service.ts";
import { automationStudioReplayingBinding, type AutomationStudioReplayingBindingCalls } from "../../replaying-binding.ts";
import {
  adaptiveTrainingMetadata,
} from "../../service-fixtures.ts";

// **A repair is applied only after the whole re-authored Flow ran from its
// start and was judged (t244, user 2026-10-02).** The re-author is an extend
// build seeded with the Flow's one step, carried as `f1`; a carried step never
// ran in this build, so the build first reruns it as it stands
// (`amend_draft` rerun, `consequences: []`), and only then can it finish: its
// test runs that Flow whole and the judge's yes about it is what lets the
// adaptation be approved and applied. That is one more decision per re-author
// than before. The stand-in domain says how to run its steps again through
// `automationStudioReplayingBinding` (`../../replaying-binding.ts`).

const ACTOR = {
  actorUserId: "user-t240",
  actorSessionId: "session-t240",
};
const KEY_ID = "secret:key";
const RAW_PROVIDER_DETAIL = "raw-provider-detail-t240-must-not-escape";

const RECORD_OUTPUT: JsonObject = {
  datasetId: "products",
  label: "Products",
  recordsPath: "result.extracted",
  writeMode: "replace",
  schema: {
    schemaVersion: "0.1",
    fields: [
      { id: "name", label: "Name", valueType: "string", required: true },
    ],
  },
};

const EXTRACT: AutomationStudioNodeDefinition = {
  schemaVersion: "0.1",
  id: "t240.output.extract-list",
  version: "1.0.0",
  label: "Extract list",
  description: "Reads every item of a list.",
  category: "action",
  source: {
    kind: "importer",
    domainId: "t240",
    packageId: "t240.package",
    implementationKey: "extract-list",
  },
  availability: { kind: "domain", domainId: "t240" },
  capabilities: { executable: true },
  outputAction: { fixedOutputId: "extract-list" },
  inputs: [{ id: "in", label: "In", valueType: "any" }],
  outputs: [
    { id: "success", label: "Success", valueType: "any" },
    { id: "failed", label: "Failed", valueType: "any" },
    { id: "records", label: "Records", valueType: "array", role: "data" },
  ],
  parameters: [
    {
      id: "recordOutput",
      label: "Save records",
      valueType: "json",
      allowStateBinding: false,
      ui: { control: "record-output" },
    },
  ],
};

function nativeRuntime(): AutomationStudioNativeNodeRuntime {
  return new AutomationStudioNativeNodeRuntime().register(
    {
      schemaVersion: "0.1",
      sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION,
      packageId: "t240.package",
      packageVersion: "1.0.0",
      domainId: "t240",
      nodes: [EXTRACT],
    },
    {
      packageId: "t240.package",
      packageVersion: "1.0.0",
      implementations: {
        "extract-list": ({ parameters }) => ({
          status: "success",
          outputs: { success: true },
          effects: [
            {
              type: "policy.output.dispatch",
              payload: {
                outputId: "extract-list",
                parameters: {},
                recordOutput: parameters.recordOutput ?? null,
              },
            },
          ],
        }),
      },
    },
  );
}

interface ResolverObservation {
  input: AutomationStudioLlmProviderResolverInput;
}

interface TestHarness {
  service: AutomationStudioService;
  projectId: string;
  flowId: string;
  taskKinds: string[];
  /** What each build decision sent the provider, as the provider received it. */
  decisionPayloads: string[];
  resolverObservations: ResolverObservation[];
  /** How many times the caller's key was released: once per model call. */
  reveals(): number;
  /** The replay calls the re-author's test of the whole Flow sent the stand-in domain. */
  replays: AutomationStudioReplayingBindingCalls;
  reauthorProviderStarted: Promise<void>;
  releaseReauthorProvider(): void;
}

let tempRoot: string;
const services = new Set<AutomationStudioService>();

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-t240-"));
});

afterEach(async () => {
  await Promise.all([...services].map((service) => service.close()));
  services.clear();
  await rm(tempRoot, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 25,
  });
});

function jsonResponse(content: JsonObject): Response {
  return new Response(
    JSON.stringify({
      choices: [
        {
          finish_reason: "stop",
          message: { content: JSON.stringify(content) },
        },
      ],
      usage: {
        prompt_tokens: 14,
        completion_tokens: 7,
        total_tokens: 21,
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

async function createHarness(options: {
  failReauthorProvider: boolean;
  pauseReauthorProvider?: boolean;
  /** The run's intent. Absent is `build_and_adapt` with four calls; present, the resolution states no call budget of its own. */
  intent?: AutomationStudioRuntimeSessionLlmIntent;
  /** The re-author's first decision completes its seeded draft unchanged: it says the Flow needs no change (W17). */
  reauthorFindsNothing?: boolean;
}): Promise<TestHarness> {
  const io = new IoRegistry();
  io.registerOutput("t240", {
    definition: { id: "extract-list", title: "Extract list" },
    mode: "request",
    dispatch: async (request) => ({
      ok: true,
      domainId: "t240",
      outputId: request.outputId,
      payload: {
        result: { extracted: [{ name: "Alpha" }, { name: "Beta" }] },
      },
    }),
  });
  const taskKinds: string[] = [];
  const decisionPayloads: string[] = [];
  let signalReauthorProviderStarted!: () => void;
  let releaseReauthorProvider!: () => void;
  const reauthorProviderStarted = new Promise<void>((resolve) => { signalReauthorProviderStarted = resolve; });
  const reauthorProviderRelease = new Promise<void>((resolve) => { releaseReauthorProvider = resolve; });
  let verificationCalls = 0;
  let decisions = 0;
  let revealCount = 0;
  const resolveForCaller = createAutomationStudioSessionKeyProviderResolver({
    ports: {
      snapshot: async () => ({ keys: [{ id: KEY_ID, kind: "llm", provider: "deepseek", enabled: true, updatedAtMs: 1 }] }),
      createSessionRevealAuthorization: async (input) => ({
        authorizationId: `reveal-t240-${++revealCount}`,
        keyId: input.id,
        keyUpdatedAtMs: 1,
      }),
      revealKeyWithAuthorization: async () => ({ value: "test-provider-secret" }),
      revokeRevealAuthorization: () => undefined,
    },
    fetchImpl: (async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        messages?: Array<{ role?: string; content?: string }>;
      };
      const task = JSON.parse(
        body.messages?.find((message) => message.role === "user")?.content ??
          "{}",
      ) as { taskKind?: string };
      const taskKind = String(task.taskKind);
      taskKinds.push(taskKind);

      if (taskKind === "loop_verification") {
        verificationCalls += 1;
        return jsonResponse({
          kind: "diagnosis",
          summary:
            verificationCalls <= 2
              ? "The returned records do not answer the instruction."
              : "The repaired Flow answers the instruction.",
          diagnosis: {
            answersRequest: verificationCalls <= 2 ? "no" : "yes",
          },
        });
      }

      if (taskKind === "evidence_tool_decision") {
        decisionPayloads.push(body.messages?.find((message) => message.role === "user")?.content ?? "");
        if (options.pauseReauthorProvider) {
          signalReauthorProviderStarted();
          await reauthorProviderRelease;
        }
        if (options.failReauthorProvider) {
          return new Response(
            JSON.stringify({
              error: {
                code: "invalid_request_error",
                message: RAW_PROVIDER_DETAIL,
              },
            }),
            {
              status: 400,
              headers: { "content-type": "application/json" },
            },
          );
        }
        decisions += 1;
        if (options.reauthorFindsNothing) {
          return jsonResponse({
            kind: "evidence_tool_decision",
            summary: "The run's own record shows the Flow already does what was asked.",
            decision: { kind: "complete", result: { summary: "Step extract read every record the request asks for; the check misread the result.", nothingToChange: true } },
          });
        }
        // The carried extraction step first, run again as it stands, so the
        // Flow can be tested whole; then finish.
        return jsonResponse({
          kind: "evidence_tool_decision",
          summary: "The current topology is sufficient.",
          decision: decisions === 1
            ? { kind: "amend_draft", amendments: [{ step: 1, change: "rerun", input: { consequences: [] } }] }
            : {
                kind: "complete",
                result: { summary: "Preserve the extraction topology." },
              },
        });
      }

      throw new Error(`Unexpected provider task kind: ${taskKind}`);
    }) as typeof fetch,
  });
  const resolverObservations: ResolverObservation[] = [];
  // A node run is an act that applied; a look answers what it saw.
  const runtime = automationStudioReplayingBinding({
    domainId: "t240",
    deniedEvidenceKeys: [],
    tools: [
      {
        toolId: "t240.inspect",
        description: "Inspect the deterministic fixture.",
        inputSchema: { type: "object" },
        effect: "observe",
        initialObservation: { input: {} },
      },
    ],
    runsNodes: {},
    executeTool: async ({ toolId, value }: { toolId: string; value: JsonObject }) => toolId === "core.run_node"
      ? { kind: "llm_evidence_tool_execution" as const, evidence: { ran: String(value.node) }, effectApplied: true, draft: { actionId: String(value.node), input: value, proposes: true } }
      : { controls: [{ label: "Fixture" }] },
  });

  const service = new AutomationStudioService({
    dataDir: tempRoot,
    seedFixture: false,
    // The host's resolver: the caller's own key, released per call. Nothing is
    // issued before the run, held during it, continued after an apply, or revoked.
    llmProviderResolver: (input) => {
      resolverObservations.push({ input });
      const resolution = resolveForCaller(input);
      if (!resolution) return undefined;
      return options.intent ? resolution : { ...resolution, maxCallsPerRun: 4 };
    },
    llmEvidenceRuntime: runtime,
  })
    .bindIoRuntime(io, "t240")
    .bindNativeNodeRuntime(nativeRuntime());
  services.add(service);
  const project = await service.createProject({
    name: "t240 project",
    domainId: "t240",
  });
  const flow = await service.createFlow({
    projectId: project.id,
    flowId: "flow.t240-reauthor",
    name: "t240 Flow",
  });
  const training = adaptiveTrainingMetadata();
  await service.saveFlow({
    projectId: project.id,
    flow: {
      ...flow,
      metadata: {
        ...(flow.metadata ?? {}),
        ...training,
        trainingModeSettings: {
          ...(training.trainingModeSettings as JsonObject),
          resultCheck: {
            schedule: {
              enabled: true,
              shape: "every_run",
              initialRunCount: 3,
              interval: 5,
              decay: 5,
            },
          },
        },
      },
    },
  });
  const subflow = await service.createFlowSubflow({
    projectId: project.id,
    flowId: flow.flowId,
    name: "Primary",
    role: "primary",
  });
  const graph = await service.getFlow(project.id, subflow.graphFlowId!);
  await service.saveFlow({
    projectId: project.id,
    flow: {
      ...graph,
      nodes: [
        {
          id: "start",
          definitionId: "builtin.control.start",
          parameterValues: {},
        },
        {
          id: "extract",
          definitionId: EXTRACT.id,
          parameterValues: { recordOutput: RECORD_OUTPUT },
        },
        {
          id: "end",
          definitionId: "builtin.control.end",
          parameterValues: { status: "success" },
        },
      ],
      edges: [
        {
          id: "start.extract",
          sourceNodeId: "start",
          sourcePortId: "success",
          targetNodeId: "extract",
          targetPortId: "in",
        },
        {
          id: "extract.end",
          sourceNodeId: "extract",
          sourcePortId: "success",
          targetNodeId: "end",
          targetPortId: "in",
        },
      ],
    },
  });
  await service.setFlowMapFallback({
    projectId: project.id,
    flowId: flow.flowId,
    kind: "subflow",
    targetSubflowId: subflow.subflowId,
  });
  const now = Date.now();
  await service.saveFlowInstruction(project.id, {
    schemaVersion: "0.1",
    instructionId: "instruction.t240",
    title: "Return fixture records",
    body: "Return three records from the fixture.",
    scope: { kind: "flow", projectId: project.id, flowId: flow.flowId },
    priority: 100,
    status: "active",
    requirement: "required",
    tags: ["generation"],
    createdAt: now,
    updatedAt: now,
  });

  return {
    service,
    projectId: project.id,
    flowId: flow.flowId,
    taskKinds,
    decisionPayloads,
    resolverObservations,
    reveals: () => revealCount,
    replays: runtime.replays,
    reauthorProviderStarted,
    releaseReauthorProvider,
  };
}

describe("refuted-result service composition", () => {
  it("persists why an unsupported held reauthor could not be rerun", { timeout: 60_000 }, async () => {
    const harness = await createHarness({ failReauthorProvider: false });
    const before = await harness.service.getFlow(harness.projectId, harness.flowId);
    const declinedCode = "repair_rerun.held_reauthor_unsupported.multiple_subflows";
    const rerunner = harness.service as unknown as { rerunAfterRepair: (request: { from?: string }) => Promise<unknown> };
    const original = rerunner.rerunAfterRepair.bind(harness.service);
    const declined = vi.spyOn(rerunner, "rerunAfterRepair").mockImplementation(request => request.from === "start" ? Promise.resolve({ declinedCode }) : original(request));
    const run = await harness.service.runRuntimeSession({ projectId: harness.projectId, flowId: harness.flowId, llmExecution: { ...ACTOR, intent: "build_and_adapt" } });
    expect(declined).toHaveBeenCalledWith(expect.objectContaining({ from: "start" }));
    const detail = await harness.service.getFlowRunDetail(harness.projectId, run.runId);
    expect(detail?.metadata?.adaptiveRetry).toEqual({ attempted: false, notResumableCode: declinedCode });
    expect(run.status).toBe("failed");
    expect(await harness.service.getFlow(harness.projectId, harness.flowId)).toEqual(before);
    expect(detail?.metadata?.resultReauthor).not.toMatchObject({ applied: true });
  });
  // The supervisor's ruling, 2026-09-28: repairing is the automation's own work
  // and nothing about why a run was asked for may refuse it. The wrong-answer
  // repair once never ran across five live runs because a grant's purpose
  // refused it, so every intent is driven through the real service and the
  // host's own resolver here, with a resolution that states no call budget.
  it.each(AUTOMATION_STUDIO_RUNTIME_SESSION_LLM_INTENTS.filter((intent) => intent !== "build_and_adapt"))(
    "reaches the re-author and applies its edit on a %s run, with no grant",
    { timeout: 60_000 },
    async (intent) => {
      const harness = await createHarness({ failReauthorProvider: false, intent });
      const run = await harness.service.runRuntimeSession({
        projectId: harness.projectId,
        flowId: harness.flowId,
        llmExecution: { ...ACTOR, intent },
      });
      const detail = await harness.service.getFlowRunDetail(harness.projectId, run.runId);
      // The build ran: its decision reached the provider, for the run's own caller.
      expect(harness.taskKinds).toContain("evidence_tool_decision");
      expect(harness.resolverObservations.length).toBeGreaterThan(0);
      for (const observation of harness.resolverObservations) {
        expect(observation.input.caller).toEqual(ACTOR);
        expect(observation.input).not.toHaveProperty("executionGrant");
      }
      expect(detail?.metadata?.resultReauthor).toMatchObject({ routed: true, applied: true });
      expect(run.status).toBe("succeeded");
    },
  );

  it(
    "does not leak private retention to a same-caller generation on another Flow",
    { timeout: 60_000 },
    async () => {
      const harness = await createHarness({ failReauthorProvider: false, pauseReauthorProvider: true });
      const running = harness.service.runRuntimeSession({
        projectId: harness.projectId, flowId: harness.flowId,
        llmExecution: { ...ACTOR, intent: "build_and_adapt" },
      });
      await harness.reauthorProviderStarted;
      let overlapFailure: unknown;
      try {
        const other = await harness.service.createFlow({ projectId: harness.projectId, flowId: "flow.public-concurrent", name: "Public concurrent" });
        await expect(harness.service.generateFlowBootstrapAdaptation({
          projectId: harness.projectId, flowId: other.flowId,
          caller: ACTOR,
        })).rejects.toThrow(/generation failed/);
      } catch (error) {
        overlapFailure = error;
      } finally {
        harness.releaseReauthorProvider();
      }
      const completed = await running;
      if (overlapFailure) throw overlapFailure;
      // The other Flow's failed generation shares nothing with this run: no
      // grant is held between them, so its failure neither revokes nor ends
      // anything here, and the run's own repair finishes.
      // The re-author is a build, so its own test is judged before it is proposed
      // (lane D F43: a re-authored Flow is judged on its own test); its two
      // decisions rerun the carried step and finish (t244); its judge's yes is
      // confirmed by a second call, as a build-finishing yes always is (murwcmx2,
      // C-H); the repaired run is then verified as before.
      expect(harness.taskKinds).toEqual(["loop_verification", "loop_verification", "evidence_tool_decision", "evidence_tool_decision", "loop_verification", "loop_verification", "loop_verification"]);
      expect(completed.status).toBe("succeeded");
      const detail = await harness.service.getFlowRunDetail(harness.projectId, completed.runId);
      expect(detail?.metadata?.resultReauthor).toMatchObject({ routed: true, applied: true });
      expect(JSON.stringify(detail)).not.toContain("test-provider-secret");
      expect(JSON.stringify(detail)).not.toContain(RAW_PROVIDER_DETAIL);
    },
  );

  it(
    "uses the run's caller for verification, extend, approval, and apply",
    { timeout: 60_000 },
    async () => {
      const harness = await createHarness({ failReauthorProvider: false });
      const run = await harness.service.runRuntimeSession({
        projectId: harness.projectId,
        flowId: harness.flowId,
        llmExecution: { ...ACTOR, intent: "build_and_adapt" },
      });
      const detail = await harness.service.getFlowRunDetail(
        harness.projectId,
        run.runId,
      );
      expect(detail?.metadata?.resultReauthor).toMatchObject({
        routed: true,
        applied: true,
      });

      // The re-author is a build, so its own test is judged before it is proposed
      // (lane D F43: a re-authored Flow is judged on its own test); its two
      // decisions rerun the carried step and finish (t244); its judge's yes is
      // confirmed by a second call, as a build-finishing yes always is (murwcmx2,
      // C-H); the repaired run is then verified as before.
      expect(harness.taskKinds).toEqual([
        "loop_verification",
        "loop_verification",
        "evidence_tool_decision",
        "evidence_tool_decision",
        "loop_verification",
        "loop_verification",
        "loop_verification",
      ]);
      expect(run.status).toBe("succeeded");
      const reauthorCall = harness.taskKinds.indexOf("evidence_tool_decision");
      expect(reauthorCall).toBe(2);
      expect(harness.taskKinds.slice(0, reauthorCall)).toEqual([
        "loop_verification",
        "loop_verification",
      ]);

      // Every model call -- the checks, the re-author's build, the re-check --
      // was resolved for the run's caller and nothing else, and each released
      // the caller's key for itself alone.
      expect(harness.resolverObservations.length).toBeGreaterThan(0);
      for (const observation of harness.resolverObservations) {
        expect(observation.input).toMatchObject({ projectId: harness.projectId, flowId: harness.flowId, caller: ACTOR });
        expect(observation.input).not.toHaveProperty("executionGrant");
      }
      expect(harness.reveals()).toBe(harness.taskKinds.length);

      expect(detail?.metadata?.resultReauthor).toMatchObject({
        routed: true,
        applied: true,
      });
      const reauthor = detail?.metadata?.resultReauthor as
        | { adaptationId?: string }
        | undefined;
      expect(reauthor?.adaptationId).toEqual(expect.any(String));
      await expect(
        harness.service.getFlowBootstrapAdaptation(
          harness.projectId,
          harness.flowId,
          reauthor!.adaptationId!,
        ),
      ).resolves.toMatchObject({ mode: "extend", status: "applied" });
      // What was applied had run whole first: the re-author's test put the
      // target back and ran the Flow's one step again from its start (t244).
      expect(harness.replays.filter((call) => call.value.replay === "step").map((call) => call.value.node)).toEqual([EXTRACT.id]);

      // run-mulwm2dc-0bd95f22: the re-author was called with a Flow id, a mode
      // and a grant, and the check's refutation went no further. The build's own
      // decision request now carries Core's repair brief beside the instruction.
      // Two decisions: the carried step's rerun, then the completion.
      expect(harness.decisionPayloads).toHaveLength(2);
      const sent = JSON.parse(harness.decisionPayloads[0]!) as { context: { instructions: { instructions: Array<{ instructionId: string; title: string; body: string }> } } };
      const listed = sent.context.instructions.instructions;
      const brief = listed.find((instruction) => instruction.instructionId === "core.result_repair.brief");
      expect(brief?.title).toBe("Repair brief from Core: the last answer was judged wrong");
      expect(brief?.body).toContain("This build is repair attempt 1 of at most 3.");
      expect(brief?.body).toContain("put it into the parameters of the step that reads the items");
      // The person's own instruction is still there, ahead of the brief.
      expect(listed.findIndex((instruction) => instruction.instructionId === "core.result_repair.brief")).toBeGreaterThan(0);

      // Every attempt is on the run with what it cost and how long it took, and
      // the repair says it settled once the repaired answer was judged.
      expect((detail?.metadata?.resultReauthor as { attempts?: unknown[] }).attempts).toEqual([
        expect.objectContaining({ attempt: 1, routed: true, applied: true, durationMs: expect.any(Number), accounting: expect.objectContaining({ requestId: expect.any(String) }), brief: expect.objectContaining({ instructionId: "core.result_repair.brief", earlierAttempts: 0 }) }),
      ]);
      expect(detail?.metadata?.resultRepair).toMatchObject({ attempted: true, attempts: 1, phase: "settled", outcome: "answered" });
    },
  );

  it(
    "preserves a structured reauthor failure without provider response text",
    { timeout: 60_000 },
    async () => {
      const harness = await createHarness({ failReauthorProvider: true });
      const run = await harness.service.runRuntimeSession({
        projectId: harness.projectId,
        flowId: harness.flowId,
        llmExecution: { ...ACTOR, intent: "build_and_adapt" },
      });

      expect(run.status).toBe("failed");
      const reauthorCall = harness.taskKinds.indexOf("evidence_tool_decision");
      expect(reauthorCall).toBe(2);
      expect(harness.taskKinds.slice(0, reauthorCall)).toEqual([
        "loop_verification",
        "loop_verification",
      ]);

      const detail = await harness.service.getFlowRunDetail(
        harness.projectId,
        run.runId,
      );
      expect(detail?.metadata?.resultReauthor).toMatchObject({
        routed: true,
        code: "flow_bootstrap.provider_http_error",
        stage: "provider_request",
        retryable: false,
        providerInvocation: "attempted",
        providerResponse: "received",
        providerStatus: 400,
      });
      // The failed build is on the run as an attempt of its own, with what it
      // spent and its code, and still without the provider's words.
      expect((detail?.metadata?.resultReauthor as { attempts?: unknown[] }).attempts).toEqual([
        expect.objectContaining({ attempt: 1, code: "flow_bootstrap.provider_http_error", durationMs: expect.any(Number), accounting: expect.objectContaining({ requestId: expect.any(String) }) }),
      ]);
      expect(detail?.metadata?.resultRepair).toMatchObject({ phase: "settled", outcome: "not_rerun" });
      expect(JSON.stringify(detail)).not.toContain(RAW_PROVIDER_DETAIL);
    },
  );

  // W17, live run `run-muw5zv4m-52d83027`: the check refuted a cart the Flow
  // had built exactly as asked, and the re-author spent 46 decisions trying to
  // change a step that had done its act, because nothing let it say the Flow
  // needs no change. Through the real service: a re-author that completes its
  // seeded draft unchanged ends there -- no test, no judge, no second decision,
  // nothing approved, applied or re-run -- and the run records why.
  it(
    "ends a re-author that completes its seeded Flow unchanged as nothing to change, applying and re-running nothing",
    { timeout: 60_000 },
    async () => {
      const harness = await createHarness({ failReauthorProvider: false, reauthorFindsNothing: true });
      const run = await harness.service.runRuntimeSession({
        projectId: harness.projectId,
        flowId: harness.flowId,
        llmExecution: { ...ACTOR, intent: "build_and_adapt" },
      });
      // The check's two calls, then the re-author's one decision, and nothing after it.
      expect(harness.taskKinds).toEqual(["loop_verification", "loop_verification", "evidence_tool_decision"]);
      expect(harness.replays).toEqual([]);
      const detail = await harness.service.getFlowRunDetail(harness.projectId, run.runId);
      const reauthor = detail?.metadata?.resultReauthor as { adaptationId?: string; applied?: boolean; held?: boolean; attempts?: unknown[] } | undefined;
      expect(reauthor).toMatchObject({ routed: true, outcome: "nothing_to_change", reason: "Step extract read every record the request asks for; the check misread the result." });
      expect(reauthor?.adaptationId).toBeUndefined();
      expect(reauthor?.applied).toBeUndefined();
      expect(reauthor?.held).toBeUndefined();
      expect(reauthor?.attempts).toEqual([expect.objectContaining({ attempt: 1, outcome: "nothing_to_change" })]);
      // The check's verdict stands: the run is still the refuted one, and nothing re-ran it.
      expect(detail?.metadata?.resultRepair).toMatchObject({ phase: "settled", outcome: "not_rerun" });
      expect(run.status).toBe("failed");
    },
  );
});
