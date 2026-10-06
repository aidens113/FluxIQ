// An earlier step's output, from the model's form to the stored Flow's run (P5, t270).
//
// The model writes `{"$step": n, "output": "value", "path": "label"}` into a
// written step; Core keeps it under the earlier step's own id
// (`../../../flow-draft/binding-forms.ts`), the build's test sends the value
// that step answered in the test (`../../../llm/node-tools/replay-draft.ts`), assembly rewrites it
// to the key of the node that step became (`../../../flow-bootstrap/authoring/assemble-draft.ts`),
// and the executor resolves that key to the node's id in the stored Flow
// (`../../../executor/node-inputs.ts`). The draft here is built so the
// key is not the draft's position -- a withdrawn step, and a join an optional
// step adds -- and the stored Flow is materialised twice: as a creation, whose
// node ids hold the key, and as an extend that keeps saved ids holding none.
// The llm barrel first, as `../../../llm/decision-context/tests/recorded-runs.ts` says why.
import { describe, expect, it } from "vitest";
import {
  automationStudioFlowBootstrapDraftNodeStep,
  automationStudioLlmNodeDescriptions,
  replayAutomationStudioFlowDraft,
  type AutomationStudioLlmEvidenceToolExecutionResult
} from "../../../llm/index.ts";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, AutomationStudioNodeRegistry, type AutomationNodeExecutionResult, type AutomationNodePort } from "../../../../nodes/index.ts";
import { createBlankAutomationStudioFlowArtifact } from "../../../../model/index.ts";
import {
  automationStudioFlowDraftStepIsProposed,
  automationStudioFlowDraftTranslateBindings,
  type AutomationStudioFlowDraftStep
} from "../../../flow-draft/index.ts";
import { assembleAutomationStudioFlowDraftPlan, normalizeAutomationStudioFlowBuildPlan, validateAutomationStudioFlowBootstrapPlan, type AutomationStudioBootstrapExistingTopology } from "../../../flow-bootstrap/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../../flow-bootstrap/plan/tests/index.ts";
import { runAutomationStudioGraph } from "../../../executor/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../native-node-runtime.ts";
import { canonicalFlowDocument } from "../../../service/flows/index.ts";

const resolution = {
  scope: { kind: "domain" as const, domainId: "web-automation" },
  runtimeCapabilities: ["web.actions"],
  permissions: ["web-automation.action"]
};

// The web library, with the single-element read declaring a record output.
const VALUE_OUTPUT: AutomationNodePort = { id: "value", label: "Value", valueType: "object", role: "data" };
const READ = "web.output.dom-extract";
const TYPE = "web.output.dom-type";
const CLICK = "web.output.dom-click";
const definitions = webDomainNodeDefinitionsFixture().map((definition) => definition.id === READ ? { ...definition, outputs: [...definition.outputs, VALUE_OUTPUT] } : definition);
const registry = new AutomationStudioNodeRegistry();
for (const definition of definitions) registry.register(definition);
const nodeOf = automationStudioLlmNodeDescriptions({ registry, resolution }).definition;

const NAME = { label: "Ada Park", id: "u-17" };

function step(position: number, id: string, node: string, parameters: JsonObject, over: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep {
  return {
    position, id, iteration: position, callId: `call.${position}`, actionId: node, toolId: "core.run_node",
    input: structuredClone({ node, parameters, consequences: [] }),
    ranWith: structuredClone({ node, parameters, consequences: [] }),
    effect: node === READ ? "observe" : "mutate",
    effectApplied: true, disposition: "kept", proposes: true,
    replay: { from: { location: `https://site.test/${position}` }, produced: { at: position } },
    ...over
  };
}

/**
 * Accept the cookie banner when it shows, two steps the model withdrew, read
 * the profile's name, then write a step that types it into the copy field --
 * the written step's binding translated the way a written call's is, against
 * the draft as it stood.
 */
function draft(): AutomationStudioFlowDraftStep[] {
  const steps = [
    step(1, "d41", CLICK, { selector: "#consent" }, { routing: { kind: "optional" } }),
    step(2, "d42", TYPE, { selector: "#search", text: "wrong" }, { disposition: "dropped" }),
    step(3, "d43", CLICK, { selector: "#menu" }, { disposition: "exploratory" }),
    step(4, "d44", READ, { selector: "#profile-name" })
  ];
  const translated = automationStudioFlowDraftTranslateBindings({ selector: "#copy", text: { $step: 4, output: "value", path: "label" } }, { steps, nodeOf });
  expect(translated.refused).toEqual([]);
  expect(translated.parameters.text).toEqual({ $state: { path: "$step.d44.value.label" } });
  steps.push(step(5, "d45", TYPE, translated.parameters, { written: true }));
  return steps;
}

type Implementation = (call: { inputs: Readonly<Record<string, JsonValue>>; parameters: Readonly<Record<string, JsonValue>> }) => AutomationNodeExecutionResult;

/** Assemble, validate and materialise the draft as the build does, then run the primary graph with each web node faked. */
async function storedFlowRun(steps: readonly AutomationStudioFlowDraftStep[], options: { existing?: AutomationStudioBootstrapExistingTopology; readOutputs?: Record<string, JsonValue> } = {}) {
  const assembled = assembleAutomationStudioFlowDraftPlan({ steps: steps.filter(automationStudioFlowDraftStepIsProposed), write: automationStudioFlowBootstrapDraftNodeStep, registry, resolution, summary: "Copy the name" });
  expect(assembled.issues.filter((issue) => issue.severity === "error")).toEqual([]);
  const validated = validateAutomationStudioFlowBootstrapPlan({ plan: assembled.plan!, registry, resolution });
  expect(validated.issues.filter((issue) => issue.severity === "error")).toEqual([]);
  const parent = createBlankAutomationStudioFlowArtifact({ flowId: "flow.p5", projectId: "project.p5", name: "P5", now: 1 });
  const topology = normalizeAutomationStudioFlowBuildPlan({ adaptationId: "adaptation.bootstrap.p5", parentFlow: parent, buildPlan: validated.validated!, sourceInstructionIds: [], now: 1, existing: options.existing });
  const graph = topology.subflows.find((entry) => entry.subflow.role === "primary")!.graphFlow;
  const sent: { node: string; parameters: JsonObject }[] = [];
  const recording = (node: string, outputs: Record<string, JsonValue> = {}): Implementation => ({ parameters }) => {
    sent.push({ node, parameters: { ...parameters } });
    return { status: "success", route: "success", outputs };
  };
  const runtime = new AutomationStudioNativeNodeRuntime({ permissions: ["web-automation.action"], runtimeCapabilities: ["web.actions"] }).register(
    { schemaVersion: "0.1", sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, packageId: "@fluxiq-web-extension/domain", packageVersion: "1.0.0", domainId: "web-automation", nodes: definitions.filter((definition) => [READ, TYPE, CLICK].includes(definition.id)) },
    {
      packageId: "@fluxiq-web-extension/domain",
      packageVersion: "1.0.0",
      implementations: {
        "web.dom.extract": recording(READ, options.readOutputs ?? { value: NAME }),
        "web.dom.type": recording(TYPE),
        "web.dom.click": recording(CLICK)
      }
    }
  );
  const trace = await runAutomationStudioGraph(canonicalFlowDocument(graph), { nativeNodeExecutor: ({ node, inputs, signal }) => runtime.execute(node, inputs, signal) });
  return { sent, trace, graph };
}

/** The build's test of the same draft, with a host whose read answers the same name. */
async function buildTest(steps: readonly AutomationStudioFlowDraftStep[]) {
  const sent: { node: string; parameters: JsonObject }[] = [];
  const executeTool = async ({ value }: { callId: string; toolId: string; value: JsonObject }): Promise<AutomationStudioLlmEvidenceToolExecutionResult> => {
    if (value.replay === "reset") return { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true, resultCode: "core.replay.replayed" };
    sent.push({ node: String(value.node), parameters: value.parameters as JsonObject });
    return { kind: "llm_evidence_tool_execution", evidence: { node: String(value.node) }, effectApplied: true, resultCode: "core.replay.replayed", ...(value.node === READ ? { outputs: { value: NAME } } : {}) };
  };
  const replayed = await replayAutomationStudioFlowDraft({ steps, attempt: 1, executeTool, nodeOf });
  return { sent, ok: replayed.verdict.ok };
}

const typed = (sent: readonly { node: string; parameters: JsonObject }[]) => sent.filter((call) => call.node === TYPE).map((call) => call.parameters.text);

describe("an earlier step's output in the stored Flow", () => {
  it("is stored under the key of the node its step became, and the run hands the reader what that node produced", async () => {
    const steps = draft();
    const stored = await storedFlowRun(steps);
    expect(stored.trace.status).toBe("succeeded");
    const reader = stored.graph.nodes.find((node) => node.definitionId === TYPE)!;
    // s1 the banner, s2 the join its optional run adds, s3 the read: not the draft's position 4.
    expect(reader.parameterValues?.text).toEqual({ $state: { path: "$node.s3.value.label" } });
    expect(typed(stored.sent)).toEqual([NAME.label]);
  });

  it("resolves the same in a Flow whose nodes keep the ids they were saved with", async () => {
    const stored = await storedFlowRun(draft(), { existing: { nodeIdByKey: { s1: "node.saved.banner", s3: "node.saved.profile-name", s4: "node.saved.copy" } } });
    expect(stored.graph.nodes.map((node) => node.id)).toContain("node.saved.profile-name");
    expect(stored.trace.status).toBe("succeeded");
    expect(typed(stored.sent)).toEqual([NAME.label]);
  });

  it("fails the reader before it runs when the node it reads produced no such output: nothing is made up", async () => {
    const stored = await storedFlowRun(draft(), { readOutputs: {} });
    expect(stored.trace.status).toBe("failed");
    expect(typed(stored.sent)).toEqual([]);
    const attempt = stored.trace.attempts.find((each) => each.definitionId === TYPE)!;
    expect(attempt.failure?.code).toBe("executor.parameter.unresolved_state_path");
  });

  it("sends the build's test and the stored Flow the same value", async () => {
    const steps = draft();
    const stored = await storedFlowRun(steps);
    const tested = await buildTest(steps);
    expect(tested.ok).toBe(true);
    expect(typed(tested.sent)).toEqual(typed(stored.sent));
  });
});
