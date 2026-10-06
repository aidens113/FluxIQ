import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowArtifact } from "../../../../model/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../../../executor/index.ts";
import type { AutomationStudioBootstrapAdaptation } from "../../../flow-bootstrap/index.ts";
import { flow, rerun } from "./repair-rerun-harness.ts";

// t267: both re-author routes approve their edit and hold it. A re-run from the
// start whose latest re-author is held runs the held graph unapplied -- an
// extend overwrites the selected Subflow's graph under the same ids -- and says
// which held edit it ran, for the run's judged end to apply or not. A topology
// that is not that one graph is applied first, as before, and the marker says so.
describe("a re-run of a held re-author", () => {
  const HELD_ID = "adaptation.bootstrap.held";
  const SUBFLOW = { subflowId: "subflow.primary", graphFlowId: "flow.rerun.graph" };
  const heldMarker = { routed: true, adaptationId: HELD_ID, held: true, attempt: 1, attempts: [{ attempt: 1, routed: true, adaptationId: HELD_ID, held: true }] };
  /** The held graph: the Flow with its read re-pointed, owned by the selected Subflow. */
  const heldGraphFlow: AutomationStudioFlowArtifact = {
    ...structuredClone(flow),
    flowId: SUBFLOW.graphFlowId,
    metadata: { parentFlowId: flow.flowId, parentSubflowId: SUBFLOW.subflowId, subflowGraph: true, bootstrapAdaptationId: HELD_ID },
    nodes: flow.nodes.map((node) => node.id === "read" ? { ...node, parameterValues: { outputId: "activate-element", parameters: { elementId: "results-v2" } } } : node)
  };
  function held(overrides: { status?: AutomationStudioBootstrapAdaptation["status"]; ruleTarget?: string; subflows?: number } = {}): AutomationStudioBootstrapAdaptation {
    const entry = { subflow: { subflowId: SUBFLOW.subflowId, graphFlowId: SUBFLOW.graphFlowId }, graphFlow: heldGraphFlow };
    return {
      adaptationId: HELD_ID,
      status: overrides.status ?? "validated",
      mode: "extend",
      topology: {
        router: { routerId: "router.one", rules: [{ ruleId: "rule.one", target: { kind: "subflow", subflowId: overrides.ruleTarget ?? SUBFLOW.subflowId } }] },
        subflows: Array.from({ length: overrides.subflows ?? 1 }, () => entry)
      }
    } as unknown as AutomationStudioBootstrapAdaptation;
  }
  /** The read lands only on the re-pointed target the held edit wrote. */
  const readNeedsHeldEdit: NonNullable<AutomationStudioGraphExecutionOptions["effectDispatcher"]> = (effect) => {
    const payload = JSON.stringify(effect.payload ?? null);
    if (payload.includes("results") && !payload.includes("results-v2")) return { status: "failed", route: "failed", message: "No target resolved.", failure: { category: "target_not_found", code: "web.target.not_found", retryable: false, stage: "target_resolution" } };
    return { status: "success", route: "success", outputs: { ok: true } };
  };

  it("runs the held graph unapplied from the start, and names it on the session and the detail", async () => {
    const { result, written, saved, stored, bootstrapApplied } = await rerun({ dispatcher: readNeedsHeldEdit, reauthorMarker: heldMarker, bootstrap: held(), subflow: SUBFLOW });

    expect(result?.session?.status).toBe("succeeded");
    expect(result?.session?.trace?.attempts.slice(4).map((attempt) => attempt.nodeId)).toEqual(["search", "check", "join", "read"]);
    // The pass ran the held graph: the read it pressed is the one the edit re-pointed.
    expect(result?.flow?.nodes.find((node) => node.id === "read")?.parameterValues).toEqual({ outputId: "activate-element", parameters: { elementId: "results-v2" } });
    // Nothing was applied, and the stored Flow is as it was.
    expect(bootstrapApplied).toEqual([]);
    expect(stored.nodes.find((node) => node.id === "read")?.parameterValues).toEqual({ outputId: "activate-element", parameters: { elementId: "results" } });
    expect(written.at(-1)?.metadata?.heldReauthorAdaptationId).toBe(HELD_ID);
    const kept = saved.at(-1)?.metadata as Record<string, any> | undefined;
    expect(kept?.repairedRerun).toMatchObject({ attempted: true, status: "succeeded", heldReauthorAdaptationId: HELD_ID });
    // Still held, still waiting: only the judged end settles it.
    expect(kept?.resultReauthor).toMatchObject({ held: true, adaptationId: HELD_ID });
    expect(kept?.resultReauthor.applied).toBeUndefined();
  });

  it.each([
    ["no Subflow was selected", "none", "no_selected_subflow"],
    ["the router also routes elsewhere", "elsewhere", "router_routes_elsewhere"],
    ["the held topology has more than one Subflow", "two", "not_one_subflow"]
  ] as const)("applies the held edit first, as before, and says why, when %s", async (_case, shape, code) => {
    const bootstrap = shape === "elsewhere" ? held({ ruleTarget: "subflow.other" }) : shape === "two" ? held({ subflows: 2 }) : held();
    const { context, result, written, saved, bootstrapApplied } = await rerun({ reauthorMarker: heldMarker, bootstrap, ...(shape === "none" ? {} : { subflow: SUBFLOW }) });

    expect(bootstrapApplied).toEqual([{ flowId: context.flowId, adaptationId: HELD_ID, actorId: "runtime.result_repair" }]);
    expect(result?.session).toBeDefined();
    expect(written.at(-1)?.metadata).not.toHaveProperty("heldReauthorAdaptationId");
    const marker = (saved.at(-1)?.metadata as Record<string, any> | undefined)?.resultReauthor;
    expect(marker).toMatchObject({ applied: true, appliedBeforeJudged: code, attempts: [{ adaptationId: HELD_ID, applied: true, appliedBeforeJudged: code }] });
  });

  it("declines the pass when the held record cannot be read or is no longer validated", async () => {
    for (const bootstrap of [null, held({ status: "applied" })]) {
      const { result, written, bootstrapApplied } = await rerun({ reauthorMarker: heldMarker, bootstrap, subflow: SUBFLOW });
      expect(result).toEqual({ declinedCode: "repair_rerun.held_reauthor_unreadable" });
      expect(written).toEqual([]);
      expect(bootstrapApplied).toEqual([]);
    }
  });

  it("clears an earlier pass's held name on a pass that ran no held edit", async () => {
    const { written, saved } = await rerun({ sessionMetadata: { heldReauthorAdaptationId: "adaptation.earlier" } });

    expect(written.at(-1)?.metadata).not.toHaveProperty("heldReauthorAdaptationId");
    expect((saved.at(-1)?.metadata as Record<string, any> | undefined)?.repairedRerun).not.toHaveProperty("heldReauthorAdaptationId");
  });
});
