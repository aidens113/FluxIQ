// The names a replay and a written step travel under, and the two calls a
// test pass sends: the step as it ran, or the step on one row of a repeat with
// its bindings already resolved (t252, D1 and D6). A read that ran with no
// record output sends the one its Flow node holds (read-list S1).
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioNodeRegistry } from "../../../../nodes/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { assembleAutomationStudioFlowDraftPlan } from "../../../flow-bootstrap/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../../flow-bootstrap/plan/tests/index.ts";
import { automationStudioFlowBootstrapDraftNodeStep } from "../draft-step.ts";
import {
  AUTOMATION_STUDIO_NODE_OUTPUTS_KEY,
  AUTOMATION_STUDIO_NODE_REPLAY_ITEM_KEY,
  AUTOMATION_STUDIO_NODE_WRITE_KEY,
  AUTOMATION_STUDIO_NODE_WRITTEN_CODE,
  automationStudioNodeReplayStatus,
  automationStudioNodeReplayStepCall,
  automationStudioNodeReplayVerifyCall
} from "../replay.ts";

const ranWith = { node: "web.output.dom-click", parameters: { target: { handle: "t12" }, label: { $state: { path: "item.name" } } }, consequences: [] };
const step: AutomationStudioFlowDraftStep = {
  position: 1, id: "d1", iteration: 1, actionId: "web.output.dom-click", toolId: "core.run_node",
  input: ranWith, ranWith, effect: "mutate", effectApplied: true, disposition: "kept",
  replay: { from: { location: "https://a.example/" }, produced: { clicked: true } }
};

describe("the names a domain mirrors", () => {
  it("are Core's own words for writing, a pass's row, a node's outputs and the written answer", () => {
    expect(AUTOMATION_STUDIO_NODE_WRITE_KEY).toBe("write");
    expect(AUTOMATION_STUDIO_NODE_REPLAY_ITEM_KEY).toBe("item");
    expect(AUTOMATION_STUDIO_NODE_OUTPUTS_KEY).toBe("outputs");
    expect(AUTOMATION_STUDIO_NODE_WRITTEN_CODE).toBe("core.run_node.written");
  });

  it("never reads the written answer as a replay that passed", () => {
    expect(automationStudioNodeReplayStatus(AUTOMATION_STUDIO_NODE_WRITTEN_CODE)).toBe("failed");
    expect(automationStudioNodeReplayStatus(AUTOMATION_STUDIO_NODE_WRITTEN_CODE, "verify")).toBe("failed");
  });
});

describe("a replay call", () => {
  it("is the step as it ran when no pass is given, exactly as before", () => {
    expect(automationStudioNodeReplayStepCall(step)).toEqual({ ...ranWith, replay: "step", from: { location: "https://a.example/" }, produced: { clicked: true } });
    expect(automationStudioNodeReplayVerifyCall(step)).toEqual({ ...ranWith, replay: "verify", from: { location: "https://a.example/" } });
    expect(automationStudioNodeReplayStepCall(step, {})).toEqual(automationStudioNodeReplayStepCall(step));
    expect(automationStudioNodeReplayVerifyCall(step, {})).toEqual(automationStudioNodeReplayVerifyCall(step));
  });

  it("carries a pass's row and its resolved parameters in place of what the step ran with", () => {
    const row = { name: "Ada", mutual: 3 };
    const parameters = { target: { handle: "t12" }, label: "Ada" };
    expect(automationStudioNodeReplayStepCall(step, { item: row, parameters })).toEqual({
      node: "web.output.dom-click", parameters, consequences: [], item: row,
      replay: "step", from: { location: "https://a.example/" }, produced: { clicked: true }
    });
    expect(automationStudioNodeReplayVerifyCall(step, { item: row, parameters })).toEqual({
      node: "web.output.dom-click", parameters, consequences: [], item: row,
      replay: "verify", from: { location: "https://a.example/" }
    });
  });

  it("takes either one alone", () => {
    expect(automationStudioNodeReplayStepCall(step, { item: { name: "Ada" } })).toMatchObject({ parameters: ranWith.parameters, item: { name: "Ada" } });
    expect(automationStudioNodeReplayVerifyCall(step, { parameters: { label: "x" } })).not.toHaveProperty("item");
    expect(automationStudioNodeReplayVerifyCall(step, { parameters: { label: "x" } })).toMatchObject({ parameters: { label: "x" } });
  });

  it("is still nothing for a step that never said what it ran with", () => {
    const { ranWith: _dropped, ...unrun } = step;
    expect(automationStudioNodeReplayStepCall(unrun, { item: { name: "Ada" } })).toBeUndefined();
    expect(automationStudioNodeReplayVerifyCall(unrun, { item: { name: "Ada" } })).toBeUndefined();
  });
});

describe("a replayed read that ran with no record output", () => {
  const definitions = webDomainNodeDefinitionsFixture();
  const list = definitions.find((definition) => definition.id === "web.output.dom-extract_list")!;
  const click = definitions.find((definition) => definition.id === "web.output.dom-click")!;
  const read = (parameters: JsonObject): AutomationStudioFlowDraftStep => {
    const ran = { node: list.id, parameters, consequences: [] };
    return {
      position: 2, id: "d2", iteration: 2, actionId: list.id, toolId: "core.run_node",
      input: structuredClone(ran), ranWith: structuredClone(ran), effect: "observe", effectApplied: true, disposition: "kept",
      replay: { from: { location: "https://a.example/" }, produced: { at: 2 } }
    };
  };
  const extractList = { item: ".request", fields: { name: ".name", mutual: ".mutual" } };
  /** The record output the stored Flow's node holds, assembled from this one step as the build assembles a draft. */
  const stored = (step: AutomationStudioFlowDraftStep) => assembleAutomationStudioFlowDraftPlan({
    steps: [step],
    write: automationStudioFlowBootstrapDraftNodeStep,
    registry: new AutomationStudioNodeRegistry(definitions),
    resolution: { scope: { kind: "domain", domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] },
    summary: "Read the requests"
  }).plan!.subflows[0]!.nodes[0]!.parameters!.recordOutput;

  it("sends the record output assembly writes on its node, under the step's id", () => {
    const step = read({ extractList });
    const assembled = stored(step);

    expect(assembled).toMatchObject({ datasetId: "web-output-dom-extract-list-d2", label: list.id, writeMode: "append" });
    expect((automationStudioNodeReplayStepCall(step, {}, list)!.parameters as JsonObject).recordOutput).toEqual(assembled);
    expect((automationStudioNodeReplayVerifyCall(step, {}, list)!.parameters as JsonObject).recordOutput).toEqual(assembled);
    // The draft keeps what ran: the call is a copy.
    expect(step.ranWith!.parameters).toEqual({ extractList });
  });

  it("sends it over a pass's resolved parameters too, and over a null the step ran with", () => {
    const step = read({ extractList, recordOutput: null });
    const sent = automationStudioNodeReplayStepCall(step, { parameters: { extractList } }, list)!;

    expect((sent.parameters as JsonObject).recordOutput).toEqual(stored(read({ extractList })));
    expect((automationStudioNodeReplayStepCall(step, {}, list)!.parameters as JsonObject).recordOutput).toMatchObject({ datasetId: "web-output-dom-extract-list-d2" });
  });

  it("sends a record output the step ran with as assembly reads it, keeping a written id", () => {
    const written = { datasetId: "requests", label: "Requests" };
    const step = read({ extractList, recordOutput: written });
    const assembled = stored(step);

    expect(assembled).toMatchObject({ datasetId: "requests", label: "Requests" });
    expect((automationStudioNodeReplayStepCall(step, {}, list)!.parameters as JsonObject).recordOutput).toEqual(assembled);
    expect((automationStudioNodeReplayVerifyCall(step, {}, list)!.parameters as JsonObject).recordOutput).toEqual(assembled);
  });

  it("sends a label-only record output with the step's id, as assembly writes it", () => {
    const step = read({ extractList, recordOutput: { label: "Requests" } });
    const assembled = stored(step);

    expect(assembled).toMatchObject({ datasetId: "requests-d2", label: "Requests" });
    expect((automationStudioNodeReplayStepCall(step, {}, list)!.parameters as JsonObject).recordOutput).toEqual(assembled);
  });

  it("sends nothing new without the node's definition, for another node, or for a read of no named field", () => {
    const step = read({ extractList });

    expect(automationStudioNodeReplayStepCall(step)!.parameters).toEqual({ extractList });
    expect(automationStudioNodeReplayStepCall(step, {}, click)!.parameters).toEqual({ extractList });
    expect(automationStudioNodeReplayStepCall(read({ extractList: { item: ".request" } }), {}, list)!.parameters).toEqual({ extractList: { item: ".request" } });
  });
});
