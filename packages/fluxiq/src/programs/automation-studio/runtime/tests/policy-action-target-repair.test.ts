import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import { defineOutput, IoRegistry } from "../../../../io/index.ts";
import { RuntimeService } from "../../../../runtime/index.ts";
import { createBlankAutomationStudioFlowArtifact, type AutomationStudioFlowAdaptation } from "../../model/index.ts";
import { AutomationStudioProjectAdaptationStore, AutomationStudioProjectCompiledPlanStore, AutomationStudioProjectDatabasePool, AutomationStudioProjectGraphRepository } from "../../storage/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../executor.ts";
import { createRuntimePolicyEffectDispatcher } from "../io-policy.ts";
import { evaluateFlowAdaptationPromotionGates } from "../recovery/index.ts";

// Does an approved target repair change what a recorded step acts on? A step
// recorded from a page is a `builtin.policy.action`: the element it acts on
// travels in the `parameters` payload it dispatches, and nothing else it holds
// reaches the domain. Each case here applies a repair through the typed
// project store, runs the compiled revision that apply produced, and reads what
// the domain was asked to do, with the domain's adapter stubbed.

const PROJECT = "project.target-repair";
const FLOW = "flow.target-repair";
const DOMAIN = "example";
const OUTPUT = "example.activate";

const RECORDED: JsonObject = { outputId: OUTPUT, parameters: { selector: "#save", element: { accessibleName: "Save changes", tagName: "button" } } };
// What the domain resolved the model's handle to: Core carries it and never reads it.
const REPAIRED: JsonObject = { handles: { element: "target.2" }, accessibleName: "Apply changes", tagName: "button", selector: "#apply" };

type DispatchedEffect = { type: string; payload?: JsonValue };
type Observed = { effects: DispatchedEffect[]; commands: JsonObject[]; nativeTargets: unknown[] };

let rootDir: string;
let pool: AutomationStudioProjectDatabasePool;

beforeEach(async () => {
  rootDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-policy-target-repair-"));
  pool = new AutomationStudioProjectDatabasePool({ rootDir });
});

afterEach(async () => {
  await pool.closeAll();
  await rm(rootDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

describe("an approved target repair", () => {
  it("changes the element a recorded step asks the domain to act on, and its rollback restores the recorded one", async () => {
    await seedFlow({ id: "recorded.save", definitionId: "builtin.policy.action", parameterValues: RECORDED });
    const recorded = await runRevision(1);
    expect(recorded.commands).toHaveLength(1);
    expect(recorded.commands[0]?.target).toMatchObject({ kind: "element", fingerprint: { selector: "#save", accessibleName: "Save changes" } });

    const store = await AutomationStudioProjectAdaptationStore.open({ pool, projectId: PROJECT });
    try {
      await store.putAdaptation({ adaptation: repair("recorded.save"), changedAt: 20 });
      const applied = await store.applyApprovedAdaptation({ adaptationId: "adaptation.target-repair", actorId: "person.reviewer", changedAt: 30, promotionGates: evaluateFlowAdaptationPromotionGates });
      expect(applied.compiledArtifact?.flowRevision).toBe(2);

      const repaired = await runArtifact(applied.compiledArtifact!.artifactId, "run.repaired");
      // Core hands the domain's resolution to the dispatch as it was saved...
      expect(payloadParameters(repaired.effects[0])).toEqual({ ...(RECORDED.parameters as JsonObject), target: REPAIRED });
      // ...and the domain is asked to act on the repaired element. The recorded
      // locator stays beside it, as it does on a native node.
      expect(repaired.commands).toHaveLength(1);
      expect(repaired.commands[0]?.target).toMatchObject({ kind: "element", fingerprint: { selector: "#apply", accessibleName: "Apply changes", tagName: "button" } });
      expect(repaired.commands[0]).toMatchObject({ selector: "#save" });

      await store.rollbackAdaptation({ adaptationId: "adaptation.target-repair", actorId: "person.reviewer", changedAt: 40 });
    } finally {
      await store.close();
    }
    const restored = await runRevision(3);
    expect(payloadParameters(restored.effects[0])).toEqual(RECORDED.parameters);
    expect(restored.commands[0]?.target).toEqual(recorded.commands[0]?.target);
  });

  it("changes the target a native step receives, which it already read from the node", async () => {
    await seedFlow({ id: "native.save", definitionId: "example.target-action", parameterValues: { target: { selector: "#save" } } });
    const store = await AutomationStudioProjectAdaptationStore.open({ pool, projectId: PROJECT });
    try {
      await store.putAdaptation({ adaptation: repair("native.save"), changedAt: 20 });
      const applied = await store.applyApprovedAdaptation({ adaptationId: "adaptation.target-repair", actorId: "person.reviewer", changedAt: 30, promotionGates: evaluateFlowAdaptationPromotionGates });

      const repaired = await runArtifact(applied.compiledArtifact!.artifactId, "run.native");
      expect(repaired.nativeTargets).toEqual([REPAIRED]);
      expect(repaired.effects).toEqual([]);
    } finally {
      await store.close();
    }
  });
});

async function seedFlow(node: { id: string; definitionId: string; parameterValues: JsonObject }): Promise<void> {
  const graph = await AutomationStudioProjectGraphRepository.open({ pool, projectId: PROJECT });
  try {
    const flow = createBlankAutomationStudioFlowArtifact({ flowId: FLOW, projectId: PROJECT, name: "Target repair", now: 1 });
    // A node imported without a version is stored as `legacy`, which the executor refuses to run.
    flow.nodes = [{ ...structuredClone(node), definitionVersion: "1.0.0", label: "Save", position: { x: 0, y: 0 } }];
    flow.edges = [];
    await graph.importMonolithicFlowGraph(flow, { changedAt: 1 });
  } finally {
    await graph.close();
  }
}

function repair(nodeId: string): AutomationStudioFlowAdaptation {
  return {
    schemaVersion: "0.1",
    adaptationId: "adaptation.target-repair",
    flowId: FLOW,
    projectId: PROJECT,
    trigger: "The recorded control was renamed.",
    patch: [{ kind: "edit_action_target", targetId: nodeId, summary: "Act on the renamed control.", before: null, after: REPAIRED, metadata: { externalSideEffect: true } }],
    validationResults: [{ runId: "run.trial", status: "succeeded", checkedAt: 15, kind: "trial" }],
    status: "validated",
    author: "llm",
    riskLevel: "low",
    createdAt: 10,
    updatedAt: 20,
    metadata: { baseRevision: 1 }
  };
}

async function runRevision(flowRevision: number): Promise<Observed> {
  const plans = await AutomationStudioProjectCompiledPlanStore.open({ pool, projectId: PROJECT });
  let artifactId: string;
  try {
    artifactId = (await plans.compileFlowRevision({ flowId: FLOW, flowRevision })).artifactId;
  } finally {
    await plans.close();
  }
  return await runArtifact(artifactId, `run.revision.${flowRevision}`);
}

// Runs a compiled revision the way a run does: Core's policy dispatcher in
// front of a runtime whose only adapter records what the domain was asked.
async function runArtifact(artifactId: string, runId: string): Promise<Observed> {
  const observed: Observed = { effects: [], commands: [], nativeTargets: [] };
  const runtime = new RuntimeService();
  runtime.registerAdapter({
    adapterId: "example.runtime",
    label: "Example Runtime",
    transport: "direct",
    domainId: DOMAIN,
    capabilities: () => [{ id: "example.outputs", kind: "action", domainId: DOMAIN, outputIds: [OUTPUT] }],
    execute: (command) => {
      observed.commands.push(structuredClone(command.parameters ?? {}));
      return { commandId: command.commandId ?? "command.example", status: "succeeded" };
    }
  });
  const io = new IoRegistry();
  io.registerOutput(DOMAIN, defineOutput({ definition: { id: OUTPUT, title: "Activate" }, mode: "request", dispatch: (request) => ({ ok: true, outputId: request.outputId }) }));
  const dispatch = createRuntimePolicyEffectDispatcher(io, DOMAIN, runtime);
  const options: AutomationStudioGraphExecutionOptions = {
    effectDispatcher: async (effect, context) => {
      observed.effects.push(structuredClone(effect));
      return await dispatch(effect, context);
    },
    nativeNodeExecutor: async ({ hostContext }) => {
      observed.nativeTargets.push(structuredClone(hostContext?.target));
      return { result: { status: "success", route: "success", outputs: {} } };
    }
  };
  const plans = await AutomationStudioProjectCompiledPlanStore.open({ pool, projectId: PROJECT });
  try {
    const started = await plans.startRunFromArtifact({ artifactId, runId, options });
    expect(started.trace.status, JSON.stringify(started.trace.attempts.map((attempt) => ({ nodeId: attempt.nodeId, status: attempt.status, message: attempt.message })))).toBe("succeeded");
  } finally {
    await plans.close();
  }
  await runtime.ready();
  return observed;
}

function payloadParameters(effect: DispatchedEffect | undefined): unknown {
  const payload = effect?.payload;
  return payload && typeof payload === "object" && !Array.isArray(payload) ? payload.parameters : undefined;
}
