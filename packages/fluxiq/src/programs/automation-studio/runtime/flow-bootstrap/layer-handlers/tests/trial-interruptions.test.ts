// P6 item 3 (t799): a layer a trial pass met and the run closed becomes the
// layer handler of the next submission, as an explored close does. A help panel
// of an archive site closes by a control the client gives a durable target for.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioClearedLayer, AutomationStudioNodeAttemptTrace } from "../../../executor/index.ts";
import { AutomationStudioNodeRegistry, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import { AutomationStudioFlowCandidateSubmissionController } from "../../candidate/index.ts";
import { AutomationStudioExploredInterruptions } from "../../explored-interruptions.ts";

const definition: AutomationStudioNodeDefinition = {
  schemaVersion: "0.1", id: "domain.archive.press", version: "1.0.0", label: "Press", description: "Press one control", category: "action",
  source: { kind: "importer", domainId: "archive", implementationKey: "press" }, availability: { kind: "domain", domainId: "archive" }, capabilities: { executable: true },
  inputs: [{ id: "in", label: "In", valueType: "any" }], outputs: [{ id: "success", label: "Success", valueType: "any", role: "success" }, { id: "failed", label: "Failed", valueType: "any", role: "failure" }],
  parameters: [{ id: "selector", label: "Selector", valueType: "string", required: true }]
};
const registry = new AutomationStudioNodeRegistry().register(definition);
const resolution = { scope: { kind: "domain" as const, domainId: "archive" }, runtimeCapabilities: [], permissions: [] };
const CLOSE: JsonObject = { selector: "#help .close" };
const binding = { resolvePlanNodeParameters: async () => ({ status: "resolved" as const, parameters: { selector: "#check-out" }, handleViews: [{ handle: "t10", view: 1, location: "https://archive.test/" }] }) };

const PANEL: AutomationStudioClearedLayer = { kind: "other", control: "Close", name: "Archive help panel", wayOutDefinitionId: definition.id, controlRef: CLOSE };

function attempt(layers: AutomationStudioClearedLayer[], extra: Record<string, unknown> = {}): AutomationStudioNodeAttemptTrace {
  return { nodeId: "open", status: "succeeded", clearedLayers: layers, ...extra } as unknown as AutomationStudioNodeAttemptTrace;
}

function candidate(): JsonObject {
  const nodes = [{ key: "n0", definitionId: definition.id, definitionVersion: definition.version, consequences: [], parameters: { selector: { handle: "t10" } } }];
  return { summary: "Check out", plan: { schemaVersion: "0.1", router: { name: "Check out", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } }, subflows: [{ key: "primary", name: "Primary", role: "primary", nodes, edges: [] }] } };
}

async function submitted(record: AutomationStudioExploredInterruptions) {
  const controller = new AutomationStudioFlowCandidateSubmissionController({ projectId: "project.test", flowId: "flow.test", registry, resolution, baseDependencyDigest: "accepted.base", binding, exploredInterruptions: record });
  const answer = await controller.submit(candidate());
  if (!answer.ok) throw new Error(JSON.stringify(answer));
  return answer.candidate.buildPlan.plan.subflows[0]!.nodes;
}

describe("recording a trial's cleared layers", () => {
  it("keeps a layer with a name, a way-out definition and a control target, once by id ?? name", () => {
    const record = new AutomationStudioExploredInterruptions();
    record.trial([attempt([PANEL]), attempt([PANEL]), attempt([{ ...PANEL, id: "help-1" }]), attempt([{ ...PANEL, id: "help-1", name: "Renamed" }])]);
    expect(record.list().map((entry) => entry.kind === "trial_close" ? entry.id ?? entry.name : "press")).toEqual(["Archive help panel", "help-1"]);
  });

  it("ignores a layer missing its name, definition or target without refusing", () => {
    const record = new AutomationStudioExploredInterruptions();
    const { name: _name, ...unnamed } = PANEL;
    const { controlRef: _target, ...untargeted } = PANEL;
    const { wayOutDefinitionId: _definition, controlRef: _ref, ...unpressed } = PANEL;
    record.trial([attempt([unnamed, untargeted, unpressed]), attempt([PANEL], { skipped: true })]);
    expect(record.list()).toEqual([]);
  });

  it("is one record for a project build's environment", () => {
    const environment = {};
    expect(AutomationStudioExploredInterruptions.of(environment)).toBe(AutomationStudioExploredInterruptions.of(environment));
  });
});

describe("a layer a trial closed", () => {
  it("gets a handler waiting by the dialog fact, pressing the recorded target, with no completion check", async () => {
    const record = new AutomationStudioExploredInterruptions();
    record.trial([attempt([PANEL])]);
    const nodes = await submitted(record);
    const handler = nodes.find((node) => node.definitionId === "builtin.control.handler")!;
    expect(handler.parameters).toMatchObject({ scope: { kind: "subflow", inherit: false }, when: [{ fact: "dialog", op: "visible", value: "Archive help panel" }], completionCheck: [] });
    const press = nodes[nodes.indexOf(handler) + 1]!;
    expect(press).toMatchObject({ definitionId: definition.id, parameters: CLOSE, consequences: [] });
  });

  it("waits by the obstruction fact for a layer that carried an id", async () => {
    const record = new AutomationStudioExploredInterruptions();
    record.trial([attempt([{ ...PANEL, id: "help-1" }])]);
    const handler = (await submitted(record)).find((node) => node.definitionId === "builtin.control.handler")!;
    expect(handler.parameters).toMatchObject({ when: [{ fact: "obstruction", op: "visible", value: "Archive help panel" }] });
  });

  it("adds one handler per layer per part", async () => {
    const record = new AutomationStudioExploredInterruptions();
    record.trial([attempt([PANEL]), attempt([{ ...PANEL, id: "help-1" }])]);
    // The same layer by its name and by its id is two records; the part waits for the name once.
    expect((await submitted(record)).filter((node) => node.definitionId === "builtin.control.handler")).toHaveLength(1);
  });
});
