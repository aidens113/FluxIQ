// @fluxiq-test-group real-sql
// The bundle's hooks, from registration to a real service build with a scripted
// model: a checked rerun's control keys, the recorded steps a build reads, and the
// readings in scope while its calls run. These are one-line reads in the service
// (`service.ts`), which no narrower test executes.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { afterEach, describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioActivityHub } from "../../../../../runtime/automation-activity/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding } from "../../../../../runtime/llm/index.ts";
import { automationStudioModelFacingControlWords } from "../../../../../runtime/llm/model-facing/index.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationStudioImporterImplementationBundle, type AutomationStudioNodeDefinition } from "../../../nodes/index.ts";
import { AutomationStudioNativeNodeRuntime, AutomationStudioService } from "../../../index.ts";
import { blankFixture, caller, isJudgeRequest, judgeReply, mockProvider, rejectedGenerationDiagnostic } from "../../service-bootstrap/index.ts";

const NODE_ID = "domain.example.press-click";
type Hooks = Partial<Pick<AutomationStudioImporterImplementationBundle, "controlParameterKeys" | "recordedStepReader" | "activityControlReader" | "controlWordsReader">>;

const usage = { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCostUsd: 0.001 };
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

/** Every object in a model request or evidence that holds `key`. */
function holders(value: unknown, key: string): JsonObject[] {
  if (value === null || typeof value !== "object") return [];
  const object = value as Record<string, unknown>;
  const found = Object.hasOwn(object, key) ? [object as JsonObject] : [];
  return [...found, ...Object.values(object).flatMap((item) => holders(item, key))];
}

/**
 * Runs a build whose script presses a control with a lasting declaration, then
 * reruns that step with a new value of a parameter that does not name the control.
 * The script ends there, which ends the build; the requests are what is read.
 */
async function build(hooks: Hooks, prepare: (service: AutomationStudioService, projectId: string, flowId: string) => Promise<void> = async () => undefined) {
  const seenByTool: Array<string | undefined> = [];
  const requests: unknown[] = [];
  const decisions: JsonObject[] = [
    { kind: "tool_call", callId: "press", toolId: "core.run_node", input: { node: NODE_ID, parameters: { handle: "first", note: "hi", control: { words: "Add to basket" }, element: { name: "unread" } }, consequences: ["modify_existing"] }, add: true },
    { kind: "amend_draft", amendments: [{ step: 2, change: "rerun", input: { note: "hello" } }] }
  ];
  const provider = mockProvider(async (request) => {
    if (request.metadata?.source === "instructionAuthority") return { response: { kind: "evidence_tool_decision", decision: { kind: "complete", result: { instructed: [] } } }, usage };
    if (isJudgeRequest(request)) return judgeReply("yes");
    requests.push(request);
    const decision = decisions.shift();
    if (!decision) throw new Error("The script has ended.");
    return { response: { kind: "evidence_tool_decision", summary: "Build.", decision }, usage };
  });
  const binding: AutomationStudioLlmEvidenceRuntimeBinding = {
    domainId: "example", deniedEvidenceKeys: [], runsNodes: {},
    tools: [{ toolId: "example.look", description: "Look.", inputSchema: { type: "object" }, effect: "observe", initialObservation: { input: {} } }],
    executeTool: async ({ toolId, value }) => {
      if (toolId === "example.look") return { kind: "llm_evidence_tool_execution", evidence: { looked: true }, effectApplied: false };
      seenByTool.push(automationStudioModelFacingControlWords(value.parameters as JsonObject));
      if (value.replay === "verify") return { kind: "llm_evidence_tool_execution", evidence: { ok: true, code: "core.replay.verified" }, effectApplied: false, resultCode: "core.replay.verified" };
      if (value.replay) return { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true, resultCode: "core.replay.replayed" };
      return { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true, draft: { actionId: NODE_ID, input: value, ranWith: value, effect: "mutate", proposes: true } };
    }
  };
  const definition: AutomationStudioNodeDefinition = {
    schemaVersion: "0.1", id: NODE_ID, version: "1.0.0", label: "Press", description: "Synthetic press.", category: "action",
    source: { kind: "importer", domainId: "example", packageId: "example.package", implementationKey: NODE_ID }, availability: { kind: "domain", domainId: "example" },
    requiredRuntimeCapabilities: ["example.actions"], capabilities: { executable: true, codeBacked: true },
    inputs: [{ id: "in", label: "In", valueType: "any", required: false }], outputs: [{ id: "success", label: "Success", valueType: "any" }],
    parameters: [{ id: "handle", label: "Handle", valueType: "string", required: false }, { id: "note", label: "Note", valueType: "string", required: false }, { id: "control", label: "Control", valueType: "object", required: false }, { id: "element", label: "Element", valueType: "object", required: false }],
    outputAction: { fixedOutputId: NODE_ID }
  };
  const runtime = new AutomationStudioNativeNodeRuntime({ permissions: [], runtimeCapabilities: ["example.actions"] }).register({
    schemaVersion: "0.1", sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, packageId: "example.package", packageVersion: "1.0.0", domainId: "example", nodes: [definition]
  }, { packageId: "example.package", packageVersion: "1.0.0", implementations: { [NODE_ID]: () => ({ status: "success", route: "success", outputs: { success: true } }) }, ...hooks });
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-domain-hooks-"));
  const service = new AutomationStudioService({ dataDir, llmProviderResolver: () => ({ provider, maxCallsPerRun: 20, maxEstimatedCostUsd: 0.1 }), llmEvidenceRuntime: binding });
  cleanups.push(async () => {
    await service.close();
    await rm(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  });
  service.bindNativeNodeRuntime(runtime);
  const { IoRegistry } = await import("../../../../../io/index.ts");
  service.bindIoRuntime(new IoRegistry(), "example");
  const { project, flow } = await blankFixture(service, "active", "example");
  await prepare(service, project.id, flow.flowId);
  const events: ClientGatewayActivity[] = [];
  const unsubscribe = automationStudioActivityHub.subscribe((event) => events.push(event));
  cleanups.push(async () => unsubscribe());
  await rejectedGenerationDiagnostic(service.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, evidenceGuided: true, caller: caller() }));
  return { requests, seenByTool, events };
}

describe("a build's checked rerun", () => {
  it("takes a new value when the bound domain's bundle says which keys name the control", { timeout: 120_000 }, async () => {
    const { requests } = await build({ controlParameterKeys: new Set(["handle", "control", "element"]) });
    const [note] = holders(requests, "rerunCheck").map((held) => held.rerunCheck as JsonObject);
    expect(note).toMatchObject({ checked: true, doneAgain: false, took: true });
  });

  it("refuses it as another control when the bundle says nothing", { timeout: 120_000 }, async () => {
    const { requests } = await build({});
    const [note] = holders(requests, "rerunCheck").map((held) => held.rerunCheck as JsonObject);
    expect(note).toMatchObject({ checked: true, doneAgain: false, took: false });
    expect(note!.detail).toContain("another control");
  });
});

describe("a build's readings of a node's parameters", () => {
  it("are the bound domain's while its calls run, for what a model is told and what a card says", { timeout: 120_000 }, async () => {
    const { seenByTool, events } = await build({
      controlWordsReader: (parameters) => ({ words: [String((parameters?.control as JsonObject | undefined)?.words)], readsItsWords: false }),
      activityControlReader: (parameters) => ({ names: [(parameters as { control?: { words?: unknown } } | undefined)?.control?.words], kinds: [] })
    });
    expect(seenByTool[0]).toBe("Add to basket");
    expect(events.map((event) => event.detail?.title)).toContain("Clicking “Add to basket”");
  });

  it("are none for a domain whose bundle has none", { timeout: 120_000 }, async () => {
    const { seenByTool, events } = await build({});
    expect(seenByTool[0]).toBeUndefined();
    expect(events.map((event) => event.detail?.title)).not.toContain("Clicking “Add to basket”");
  });
});

describe("the recorded steps a build reads", () => {
  /** A finished recording of the bound domain, linked to the Flow's instruction. */
  const linked = async (service: AutomationStudioService, projectId: string, flowId: string): Promise<void> => {
    const recording = await service.createRecording({ description: "Adds an item.", projectId, recordingId: "recording.hooks", domainId: "example", initialState: { timestamp: 1, namespaces: {} } });
    await service.appendRecordingEvents({ projectId, recordingId: recording.recordingId, entries: [{ type: "action", actionType: "example.pressed", outputId: NODE_ID, startedAt: 2, origin: "operator", parameters: { words: "Recorded Add" } }] });
    await service.finalizeRecording({ projectId, recordingId: recording.recordingId, endedAt: 3 });
    await service.saveFlowGenerationInstruction({ projectId, flowId, instruction: "Add the item.", linkedRecordingIds: [recording.recordingId] });
  };

  it("are read by the recording's own domain", { timeout: 120_000 }, async () => {
    const { requests } = await build({
      recordedStepReader: ({ entry }) => ({ secret: false, identity: [], label: entry.type === "action" ? String(entry.parameters.words) : undefined, entersValue: false, undoes: false })
    }, linked);
    expect(holders(requests, "withheldSteps")[0]).toMatchObject({ withheldSteps: 0, steps: [{ kind: "pressed", label: "Recorded Add" }] });
  });

  it("are withheld and only counted when the bundle has no reader", { timeout: 120_000 }, async () => {
    const { requests } = await build({}, linked);
    expect(holders(requests, "withheldSteps")[0]).toMatchObject({ withheldSteps: 1, steps: [] });
    expect(JSON.stringify(requests)).not.toContain("Recorded Add");
  });
});
