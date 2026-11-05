// @fluxiq-test-group real-sql
// A part stops as a Flow does at a row a page-level link left behind (t869; `../left-behind.ts`, the
// Flow's is `service/answer-first/run-acts/run-gate.ts`). The real store, executor, For Each and frames,
// a host and a domain of plain functions; a step says, as a page does, that it went by a link not shown
// to be its row's (`resolution.passRow`). Asserted: what reached the domain, and what the part says.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RunProjectPartResponse } from "../../../../../../api-contracts/automation.ts";
import type { AutomationStudioFlowArtifact } from "../../../../../../flows/authoring/model/index.ts";
import type { AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../../../../../flows/executable/graph/index.ts";
import { openRowsHarness, rowGraph, PROJECT, type RowsHarness } from "./part-rows-harness.ts";

const ASKED = { permittedConsequences: ["create_new"], acknowledgedRepeat: true };
const step = (id: string, label: string): AutomationStudioFlowNode => ({ id, definitionId: "custom.step", definitionVersion: "1.0.0", label, parameterValues: {}, metadata: { declaredConsequences: [] } });
const edge = (id: string, sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId = "in"): AutomationStudioFlowEdge => ({ id, sourceNodeId, sourcePortId, targetNodeId, targetPortId });

/** Read the list, then for each row: a link step, and where asked an own-control step, then the press. Each is handed the row. */
function graphWith(options: { own?: boolean } = {}): AutomationStudioFlowArtifact {
  const link = step("s.link", "Open the row's title");
  const graph = rowGraph("s", { before: link });
  graph.edges.push(edge("s.link-row", "s.each", "item", "s.link", "item"));
  if (options.own) {
    const own = step("s.own", "Open the row's own card");
    graph.nodes.push(own);
    graph.edges = graph.edges.filter((one) => one.id !== "s.8");
    graph.edges.push(edge("s.8a", "s.link", "success", "s.own"), edge("s.8b", "s.own", "success", "s.press"), edge("s.own-row", "s.each", "item", "s.own", "item"));
  }
  return graph;
}

describe("a row a page-level link left behind, in a part", () => {
  let harness: RowsHarness;
  const runIt = async (partId: string) => await harness.parts.run({ projectId: PROJECT, partId, inputs: {}, ...ASKED }) as RunProjectPartResponse;
  const open = async (moves: readonly string[]) => {
    await harness?.close();
    harness = await openRowsHarness({ moves });
  };

  beforeEach(async () => {
    await open(["s.link", "s.own"]);
  });
  afterEach(async () => {
    await harness.close();
  });

  it("the lasting step after the link is not sent, and the part says which item it was for", async () => {
    harness.page.passRow = { link: "page-level-link" };
    const answer = await runIt(await harness.save([graphWith()]));
    expect(answer).toMatchObject({ status: "stopped", acts: [], modelCalls: 0, stoppedAt: { stepLabel: "Press it", reason: expect.stringContaining("link that is not shown to be this item's") } });
    expect(harness.domain.pressed, "nothing was pressed").toEqual([]);
    expect(harness.domain.described, "nothing was even asked of the control").toEqual([]);
  });

  it("with no word from the page, the same part presses every row", async () => {
    const answer = await runIt(await harness.save([graphWith()]));
    expect(answer.status).toBe("succeeded");
    expect(harness.domain.pressed).toEqual(["a", "b", "c"]);
  });

  it("a later step that found its row takes it back, and the press lands", async () => {
    harness.page.passRow = { link: "page-level-link", own: "own" };
    const answer = await runIt(await harness.save([graphWith({ own: true })]));
    expect(answer.status).toBe("succeeded");
    expect(harness.domain.pressed).toEqual(["a", "b", "c"]);
  });

  it("a step that declares nothing lasting after the link still runs", async () => {
    harness.page.passRow = { link: "page-level-link", own: "page-level-link" };
    const answer = await runIt(await harness.save([graphWith({ own: true })]));
    expect(answer.status).toBe("stopped");
    expect(harness.domain.ran).toEqual(["s.link", "s.own"]);
    expect(harness.domain.pressed).toEqual([]);
  });
});
