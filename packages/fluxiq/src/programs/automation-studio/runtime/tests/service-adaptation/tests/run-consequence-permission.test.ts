// A run a person asked the model into needs no grant to call the model, and
// still needs the person's permission for a lasting consequence.
//
// Driven through `runRuntimeSession` -- the service's own wiring from the run
// input to the recovery's consequence gate -- with a stand-in domain whose
// press asks Core first and declares `delete`, a class the gate still asks
// about. The annotation-level cases live in
// `recovery/annotation/tests/recovery-permissions.test.ts`; this holds the
// service seam: `permittedConsequences` is read from the run's own input, not
// from anything a provider resolution carries.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioActionConsequence } from "../../../action-permissions/index.ts";
import type {
  AutomationStudioHarnessOptionBundle,
  AutomationStudioLlmProvider,
  AutomationStudioLlmProviderResolverInput,
  AutomationStudioLlmTaskRequest
} from "../../../llm/index.ts";
import { AutomationStudioService } from "../../../service.ts";
import { adaptiveTrainingMetadata, createFailingCanonicalFlow } from "../../service-fixtures.ts";

const CALLER = { actorUserId: "user.test", actorSessionId: "session.test" };

let tempRoot: string;
const services = new Set<AutomationStudioService>();

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-run-consequence-permission-"));
});

afterEach(async () => {
  await Promise.all([...services].map((service) => service.close()));
  services.clear();
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

type Run = {
  status: string;
  /** The permission ask the run raised in its thread, if it raised one. */
  ask?: JsonObject | undefined;
  metadata: JsonObject | undefined;
  pressed: string[];
  taskKinds: string[];
  resolved: AutomationStudioLlmProviderResolverInput[];
};

describe("a run a person asked the model into, and a lasting consequence", () => {
  // With nothing permitted the press stops at the gate and a request is raised
  // in the run's thread; the run waits there for the person. This person says no.
  it("calls the model with no grant, and stops at permission_required when the run permits nothing", async () => {
    const run = await recover(undefined, "deny");

    // The model was called: diagnosis, then the exploration's decision. No
    // grant was issued, held or checked; the resolver saw only the caller.
    expect(run.taskKinds.slice(0, 2)).toEqual(["runtime_diagnosis", "evidence_tool_decision"]);
    expect(run.resolved.length).toBeGreaterThan(0);
    for (const input of run.resolved) {
      expect(input.caller).toEqual(CALLER);
      expect(input).not.toHaveProperty("executionGrant");
    }
    // The press asked, the person was asked in the run's thread, and the press
    // was not taken.
    expect(run.ask).toMatchObject({
      kind: "permission",
      missing: ["delete"],
      permissionRequest: {
        schemaVersion: "automation-studio.action-permission-request.v1",
        action: { kind: "exploration_step", id: "test.press", verb: "press" },
        consequences: ["delete"],
        missing: ["delete"],
        reason: { stage: "recovery" }
      }
    });
    expect(run.pressed).toEqual([]);
    // Refused, the recovery ends at the gate without a patch call.
    expect(run.metadata?.llmGate).toMatchObject({ patchSkippedCode: "llm.runtime_patch_permission_required", permissions: { granted: [] } });
    expect(run.taskKinds).not.toContain("runtime_patch");
  }, 60_000);

  it("proceeds when the run's own request permits the consequence, asking nobody", async () => {
    const run = await recover(["delete"]);

    expect(run.ask).toBeUndefined();
    expect(run.pressed).toEqual(["Cancel unfilled lines"]);
    expect(run.metadata).not.toHaveProperty("permissionRequest");
    expect((run.metadata?.llmGate as JsonObject | undefined)?.permissions).toMatchObject({ granted: ["delete"] });
    expect((run.metadata?.llmGate as JsonObject | undefined)?.patchSkippedCode).toBeUndefined();
    expect(run.taskKinds).toContain("runtime_patch");
  }, 60_000);
});

async function recover(permittedConsequences?: AutomationStudioActionConsequence[], answer?: "deny"): Promise<Run> {
  const pressed: string[] = [];
  const taskKinds: string[] = [];
  const resolved: AutomationStudioLlmProviderResolverInput[] = [];
  const provider: AutomationStudioLlmProvider = {
    metadata: { provider: "mock", model: "permission-model" },
    runTask: async (request: AutomationStudioLlmTaskRequest) => {
      taskKinds.push(request.taskKind);
      if (request.expectedOutput === "diagnosis") {
        return { response: { kind: "diagnosis", summary: "The step failed; look before changing anything.", diagnosis: { explorationNeeded: true, patchNeeded: true } }, usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6 } };
      }
      if (request.expectedOutput === "evidence_tool_decision") {
        const decision = request.context.evidenceLoop?.iteration === 1
          ? { kind: "tool_call" as const, callId: "call.press", toolId: "test.press", input: {} }
          : { kind: "complete" as const, result: { findings: "The press ran." } };
        return { response: { kind: "evidence_tool_decision", summary: "Trying the control.", decision }, usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6 } };
      }
      return { response: { kind: "no_repair", summary: "Nothing to change.", reason: "control_gone" }, usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6 } };
    }
  };
  const service = new AutomationStudioService({
    dataDir: tempRoot,
    seedFixture: false,
    llmProviderResolver: (input) => {
      resolved.push(input);
      // Resolves only for a caller, as the host's session-key resolver does.
      return input.caller ? { provider, maxCallsPerRun: 6 } : undefined;
    },
    llmEvidenceRuntime: {
      domainId: "test.domain",
      deniedEvidenceKeys: [],
      tools: [],
      harnessOptions: options(pressed),
      executeTool: async () => { throw new Error("The bare tool slot is not used by this binding."); }
    }
  });
  services.add(service);
  const project = await service.createProject({ name: "Run consequence permission" });
  const flow = await createFailingCanonicalFlow(service, project.id, { flowId: "flow.run-consequence-permission", metadata: adaptiveTrainingMetadata() });
  let settled = false;
  // A parked run waits for its answer; this plays the person.
  const answering = answer ? (async () => {
    for (let attempt = 0; attempt < 600 && !settled; attempt += 1) {
      for (const conversation of await service.conversations.listConversations({ projectId: project.id })) {
        const thread = await service.conversations.getConversation({ projectId: project.id, conversationId: conversation.conversationId });
        const askId = thread?.turns.find((turn) => turn.ask?.kind === "permission")?.ask?.askId;
        if (askId) {
          const ask = await service.conversations.getAsk({ projectId: project.id, askId });
          await service.conversations.answerAsk({ projectId: project.id, askId, kind: answer });
          return ask as unknown as JsonObject;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return undefined;
  })() : Promise.resolve(undefined);
  const run = await service.runRuntimeSession({
    projectId: project.id,
    flowId: flow.flowId,
    inputs: { numerator: 1, denominator: 0 },
    llmExecution: { ...CALLER, intent: "explore_and_adapt" },
    ...(permittedConsequences ? { permittedConsequences } : {})
  }).finally(() => { settled = true; });
  const ask = await answering;
  const detail = await service.getFlowRunDetail(project.id, run.runId);
  return { status: run.status, metadata: detail?.metadata, ...(ask ? { ask } : {}), pressed, taskKinds, resolved };
}

/** One press that asks Core before it lastingly deletes something. */
function options(pressed: string[]): AutomationStudioHarnessOptionBundle {
  return {
    schemaVersion: "0.1",
    domainId: "test.domain",
    options: [{
      toolId: "test.press",
      description: "Press a control.",
      inputSchema: { type: "object", additionalProperties: false, properties: {} },
      effect: "mutate",
      availability: { kind: "domain", domainId: "test.domain" },
      safety: { sideEffect: "mutate" },
      stages: ["gather", "iterate"]
    }],
    implementations: {
      "test.press": async (input) => {
        const verdict = await input.permission({ consequences: ["delete"], control: { name: "Cancel unfilled lines", kind: "button" }, verb: "press" });
        if (!verdict.permitted) return { kind: "llm_evidence_tool_execution", evidence: { pressed: false }, effectApplied: false, resultCode: "test.permission_required" };
        pressed.push("Cancel unfilled lines");
        return { kind: "llm_evidence_tool_execution", evidence: { status: "Cancelled" }, effectApplied: true };
      }
    }
  };
}
