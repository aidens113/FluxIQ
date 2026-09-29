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
import { AUTOMATION_STUDIO_RUNTIME_SESSION_GRANT_PURPOSES, AutomationStudioLlmExecutionGrantService, type AutomationStudioRuntimeSessionGrantPurpose } from "../../../llm/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../native-node-runtime.ts";
import {
  AutomationStudioService,
  type AutomationStudioLlmProviderResolverInput,
} from "../../../service.ts";
import {
  adaptiveTrainingMetadata,
} from "../../service-fixtures.ts";

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
  binding: Awaited<
    ReturnType<AutomationStudioService["getLlmExecutionBinding"]>
  >;
}

interface TestHarness {
  service: AutomationStudioService;
  grants: AutomationStudioLlmExecutionGrantService;
  grant: { grantId: string };
  projectId: string;
  flowId: string;
  taskKinds: string[];
  /** What each build decision sent the provider, as the provider received it. */
  decisionPayloads: string[];
  resolverObservations: ResolverObservation[];
  revokedGrantIds: string[];
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
  failContinuation?: boolean;
  failAppliedBindingRead?: boolean;
  pauseReauthorProvider?: boolean;
  /** The run's grant purpose. Absent is `build_and_adapt` with four calls; present, the grant is issued with no call budget of its own. */
  purpose?: AutomationStudioRuntimeSessionGrantPurpose;
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
  const revokedGrantIds: string[] = [];
  let signalReauthorProviderStarted!: () => void;
  let releaseReauthorProvider!: () => void;
  const reauthorProviderStarted = new Promise<void>((resolve) => { signalReauthorProviderStarted = resolve; });
  const reauthorProviderRelease = new Promise<void>((resolve) => { releaseReauthorProvider = resolve; });
  let verificationCalls = 0;
  let service: AutomationStudioService | undefined;
  let revealCount = 0;
  const key = {
    id: KEY_ID,
    name: "DeepSeek",
    kind: "llm",
    provider: "deepseek",
    scope: "global",
    enabled: true,
    createdAtMs: 1,
    updatedAtMs: 1,
    lastRotatedAtMs: 1,
    metadata: { model: "deepseek-flash" },
  };

  const grants = new AutomationStudioLlmExecutionGrantService({
    resolveExecutionDigest: async (projectId, flowId) =>
      service!.getLlmExecutionBinding(projectId, flowId),
    identityAccess: {
      validateSession: async () => ({
        user: {
          id: ACTOR.actorUserId,
          passwordConfigured: true,
          pinConfigured: true,
        },
        session: {},
        role: {},
      }),
    } as any,
    secretKeys: {
      getKeySummary: async () => ({ ...key }),
      createSessionRevealAuthorization: async (input: {
        ttlMs?: number;
        nowMs: number;
      }) => ({
        authorizationId: `reveal-t240-${++revealCount}`,
        keyId: key.id,
        keyUpdatedAtMs: key.updatedAtMs,
        expiresAtMs: input.nowMs + (input.ttlMs ?? 60_000),
        remainingUses: 1,
      }),
      revealKeyWithAuthorization: async () => ({
        key: { ...key },
        value: "test-provider-secret",
      }),
      revokeRevealAuthorization: () => undefined,
    } as any,
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
        return jsonResponse({
          kind: "evidence_tool_decision",
          summary: "The current topology is sufficient.",
          decision: {
            kind: "complete",
            result: { summary: "Preserve the extraction topology." },
          },
        });
      }

      throw new Error(`Unexpected provider task kind: ${taskKind}`);
    }) as typeof fetch,
  });
  const resolverObservations: ResolverObservation[] = [];

  service = new AutomationStudioService({
    dataDir: tempRoot,
    seedFixture: false,
    llmProviderResolver: async (input) => {
      resolverObservations.push({
        input,
        binding: await service!.getLlmExecutionBinding(
          input.projectId,
          input.flowId,
        ),
      });
      return input.executionGrant
        ? grants.resolve({
            ...input.executionGrant,
            projectId: input.projectId,
            flowId: input.flowId,
          })
        : undefined;
    },
    revokeLlmExecutionGrant: (grantId) => { revokedGrantIds.push(grantId); grants.revoke(grantId); },
    continueLlmExecutionGrantAfterAppliedFlowAdaptation: (input) => {
      if (options.failContinuation) grants.revoke(input.grantId);
      return grants.continueAfterAppliedFlowAdaptation(input);
    },
    closeLlmExecutionGrants: () => grants.close(),
    llmEvidenceRuntime: {
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
      executeTool: async () => ({ controls: [{ label: "Fixture" }] }),
    },
  })
    .bindIoRuntime(io, "t240")
    .bindNativeNodeRuntime(nativeRuntime());
  services.add(service);
  if (options.failAppliedBindingRead) {
    const readAdaptation = service.getFlowBootstrapAdaptation.bind(service);
    const readBinding = service.getLlmExecutionBinding.bind(service);
    let failNextBindingRead = false;
    vi.spyOn(service, "getFlowBootstrapAdaptation").mockImplementation(async (...args) => {
      const found = await readAdaptation(...args);
      if (found?.status === "validated") failNextBindingRead = true;
      return found;
    });
    vi.spyOn(service, "getLlmExecutionBinding").mockImplementation(async (...args) => {
      if (failNextBindingRead) {
        failNextBindingRead = false;
        throw new Error("authoritative binding read detail must not escape");
      }
      return await readBinding(...args);
    });
  }

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

  const grant = await grants.issue({
    ...ACTOR,
    keyId: KEY_ID,
    projectId: project.id,
    flowId: flow.flowId,
    provider: "deepseek",
    model: "deepseek-flash",
    ...(options.purpose ? { purpose: options.purpose } : { purpose: "build_and_adapt", maxCalls: 4 }),
  });
  await grants.holdForRun({
    grantId: grant.grantId,
    ...ACTOR,
    projectId: project.id,
    flowId: flow.flowId,
    purpose: options.purpose ?? "build_and_adapt",
  });

  return {
    service,
    grants,
    grant,
    projectId: project.id,
    flowId: flow.flowId,
    taskKinds,
    decisionPayloads,
    resolverObservations,
    revokedGrantIds,
    reauthorProviderStarted,
    releaseReauthorProvider,
  };
}

describe("refuted-result service composition", () => {
  // The supervisor's ruling, 2026-09-28: repairing is the automation's own work
  // and no grant purpose may refuse it. This gate is how the wrong-answer repair
  // never ran once across five live runs (it asked for `explore_and_adapt`,
  // every instruction-built Flow ran under `build_and_adapt`), so every purpose
  // Core issues is driven through the real service and the real grant registry
  // here, with a grant that states no call budget of its own.
  it.each(AUTOMATION_STUDIO_RUNTIME_SESSION_GRANT_PURPOSES.filter((purpose) => purpose !== "build_and_adapt"))(
    "reaches the re-author and applies its edit under a %s grant",
    { timeout: 60_000 },
    async (purpose) => {
      const harness = await createHarness({ failReauthorProvider: false, purpose });
      const run = await harness.service.runRuntimeSession({
        projectId: harness.projectId,
        flowId: harness.flowId,
        llmExecution: { grantId: harness.grant.grantId, ...ACTOR, purpose },
      });
      const detail = await harness.service.getFlowRunDetail(harness.projectId, run.runId);
      // The build ran: its decision reached the provider, under the run's own grant and purpose.
      expect(harness.taskKinds).toContain("evidence_tool_decision");
      const build = harness.resolverObservations.find((observation) => {
        const grant = observation.input.executionGrant;
        return Boolean(grant && "executionDigest" in grant);
      });
      expect(build?.input.executionGrant).toMatchObject({ grantId: harness.grant.grantId, purpose });
      expect(detail?.metadata?.resultReauthor).toMatchObject({ routed: true, applied: true });
      expect(JSON.stringify(detail?.metadata?.resultReauthor)).not.toContain("execution_grant_purpose_invalid");
      expect(run.status).toBe("succeeded");
    },
  );

  it(
    "does not leak private retention to a same-grant public generation on another Flow",
    { timeout: 60_000 },
    async () => {
      const harness = await createHarness({ failReauthorProvider: false, pauseReauthorProvider: true });
      const running = harness.service.runRuntimeSession({
        projectId: harness.projectId, flowId: harness.flowId,
        llmExecution: { grantId: harness.grant.grantId, ...ACTOR, purpose: "build_and_adapt" },
      });
      await harness.reauthorProviderStarted;
      let overlapFailure: unknown;
      try {
        const other = await harness.service.createFlow({ projectId: harness.projectId, flowId: "flow.public-concurrent", name: "Public concurrent" });
        const binding = await harness.service.getLlmExecutionBinding(harness.projectId, other.flowId);
        await expect(harness.service.generateFlowBootstrapAdaptation({
          projectId: harness.projectId, flowId: other.flowId,
          executionGrant: { grantId: harness.grant.grantId, ...ACTOR, purpose: "build_and_adapt", ...binding },
        })).rejects.toThrow(/generation failed/);
        expect(harness.revokedGrantIds).toEqual([harness.grant.grantId]);
        expect(harness.grants.activeGrantCount()).toBe(0);
      } catch (error) {
        overlapFailure = error;
      } finally {
        harness.releaseReauthorProvider();
      }
      const completed = await running;
      if (overlapFailure) throw overlapFailure;
      expect(completed.status).toBe("failed");
      expect(harness.taskKinds).toEqual(["loop_verification", "loop_verification", "evidence_tool_decision"]);
      const detail = await harness.service.getFlowRunDetail(harness.projectId, completed.runId);
      expect(JSON.stringify(detail)).not.toContain("test-provider-secret");
      expect(JSON.stringify(detail)).not.toContain(RAW_PROVIDER_DETAIL);
      expect(harness.grants.activeGrantCount()).toBe(0);
    },
  );

  it(
    "uses an admitted build-and-adapt grant for verification, extend, approval, and apply",
    { timeout: 60_000 },
    async () => {
      const harness = await createHarness({ failReauthorProvider: false });
      const run = await harness.service.runRuntimeSession({
        projectId: harness.projectId,
        flowId: harness.flowId,
        llmExecution: {
          grantId: harness.grant.grantId,
          ...ACTOR,
          purpose: "build_and_adapt",
        },
      });
      const detail = await harness.service.getFlowRunDetail(
        harness.projectId,
        run.runId,
      );
      expect(detail?.metadata?.resultReauthor).toMatchObject({
        routed: true,
        applied: true,
        replayReady: true,
      });

      expect(harness.taskKinds).toEqual([
        "loop_verification",
        "loop_verification",
        "evidence_tool_decision",
        "loop_verification",
      ]);
      expect(run.status).toBe("succeeded");
      const reauthorCall = harness.taskKinds.indexOf("evidence_tool_decision");
      expect(reauthorCall).toBe(2);
      expect(harness.taskKinds.slice(0, reauthorCall)).toEqual([
        "loop_verification",
        "loop_verification",
      ]);

      const scope = harness.resolverObservations.find(
        (observation) => {
          const grant = observation.input.executionGrant;
          return Boolean(
            grant &&
              "executionDigest" in grant &&
              typeof grant.executionDigest === "string",
          );
        },
      );
      expect(scope?.input).toMatchObject({
        projectId: harness.projectId,
        flowId: harness.flowId,
        executionGrant: {
          grantId: harness.grant.grantId,
          ...ACTOR,
          purpose: "build_and_adapt",
        },
      });
      expect(scope?.input.executionGrant).toMatchObject({
        executionDigest: scope?.binding.executionDigest,
        settingsRevision: scope?.binding.settingsRevision,
      });

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
      expect(harness.grants.activeGrantCount()).toBe(0);

      // run-mulwm2dc-0bd95f22: the re-author was called with a Flow id, a mode
      // and a grant, and the check's refutation went no further. The build's own
      // decision request now carries Core's repair brief beside the instruction.
      expect(harness.decisionPayloads).toHaveLength(1);
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
    "keeps durable applied provenance and skips replay when the applied binding cannot be read",
    { timeout: 60_000 },
    async () => {
      const harness = await createHarness({
        failReauthorProvider: false,
        failAppliedBindingRead: true,
      });
      const run = await harness.service.runRuntimeSession({
        projectId: harness.projectId,
        flowId: harness.flowId,
        llmExecution: { grantId: harness.grant.grantId, ...ACTOR, purpose: "build_and_adapt" },
      });

      expect(run.status).toBe("failed");
      expect(harness.taskKinds).toEqual(["loop_verification", "loop_verification", "evidence_tool_decision"]);
      const detail = await harness.service.getFlowRunDetail(harness.projectId, run.runId);
      expect(detail?.metadata?.resultReauthor).toMatchObject({
        routed: true, applied: true, replayReady: false,
        code: "llm.execution_grant_no_longer_valid", stage: "grant_continuation",
        retryable: false, providerInvocation: "not_attempted", providerResponse: "not_received",
      });
      const reauthor = detail?.metadata?.resultReauthor as { adaptationId?: string } | undefined;
      await expect(harness.service.getFlowBootstrapAdaptation(harness.projectId, harness.flowId, reauthor!.adaptationId!))
        .resolves.toMatchObject({ mode: "extend", status: "applied" });
      expect(JSON.stringify(detail)).not.toContain("authoritative binding read detail must not escape");
      expect(harness.grants.activeGrantCount()).toBe(0);
    },
  );

  it(
    "keeps a durable applied adaptation but refuses replay when grant continuation closes",
    { timeout: 60_000 },
    async () => {
      const harness = await createHarness({
        failReauthorProvider: false,
        failContinuation: true,
      });
      const run = await harness.service.runRuntimeSession({
        projectId: harness.projectId,
        flowId: harness.flowId,
        llmExecution: {
          grantId: harness.grant.grantId,
          ...ACTOR,
          purpose: "build_and_adapt",
        },
      });

      expect(run.status).toBe("failed");
      expect(harness.taskKinds).toEqual([
        "loop_verification",
        "loop_verification",
        "evidence_tool_decision",
      ]);
      const detail = await harness.service.getFlowRunDetail(
        harness.projectId,
        run.runId,
      );
      expect(detail?.metadata?.resultReauthor).toMatchObject({
        routed: true,
        applied: true,
        replayReady: false,
        code: "llm.execution_grant_unavailable",
        stage: "grant_continuation",
        retryable: false,
        providerInvocation: "not_attempted",
        providerResponse: "not_received",
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
      expect(JSON.stringify(detail)).not.toContain(RAW_PROVIDER_DETAIL);
      expect(harness.grants.activeGrantCount()).toBe(0);
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
        llmExecution: {
          grantId: harness.grant.grantId,
          ...ACTOR,
          purpose: "build_and_adapt",
        },
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
      expect(harness.grants.activeGrantCount()).toBe(0);
    },
  );
});
