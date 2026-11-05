// A fix to a saved version asks for its run's judged yes itself, off the run's own record, so
// nothing moves on anyone's word: not a settle that went wrong, and not a person's apply.
import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioFlowAdaptation, AutomationStudioRuntimeSession } from "../../../../../../flows/authoring/model/index.ts";
import { applyProjectPartPinnedRepair, projectPartPinOfAdaptation, type ProjectPartPinnedRepairPorts } from "../pinned-repair.ts";

const change = { kind: "replace_unit", targetId: "step", summary: "Press another control." } as unknown as AutomationStudioFlowAdaptation["patch"][number];
const adaptation = { adaptationId: "adaptation.one", projectId: "project.one", flowId: "flow.one", subflowId: "part:part.shared:v1", sourceRunId: "run.one", patch: [change] } as unknown as AutomationStudioFlowAdaptation;

/** A run that finished, with what its record says. It ran the version, so only the verdict can stop the fix. */
const runThat = (status: string, resultVerification?: Record<string, unknown>) => ({
  runId: "run.one",
  status,
  metadata: resultVerification ? { resultVerification } : {},
  trace: { attempts: [{ attemptId: "a", nodeId: "call", definitionId: "builtin.control.call-subflow", status: "succeeded", subflowTarget: { subflowId: "part:part.shared:v1", graphFlowId: "graph", graphRevision: null } }] }
}) as unknown as AutomationStudioRuntimeSession;

const portsFor = (session: AutomationStudioRuntimeSession | null) => {
  const saveFlowInternal = vi.fn();
  const resolveFlowNodeAdaptationTarget = vi.fn();
  const ports = {
    pool: undefined,
    getRuntimeSession: async () => session,
    instructionBodies: async () => [],
    patches: { resolveFlowNodeAdaptationTarget },
    flowWriter: { saveFlowInternal }
  } as unknown as ProjectPartPinnedRepairPorts;
  return { ports, saveFlowInternal, resolveFlowNodeAdaptationTarget };
};

describe("keeping a fix to a saved version", () => {
  it("reads which fixes are its own by the pin they name", () => {
    expect(projectPartPinOfAdaptation(adaptation)).toEqual({ partId: "part.shared", version: 1 });
    expect(projectPartPinOfAdaptation({ subflowId: "subflow.main" })).toBeUndefined();
    expect(projectPartPinOfAdaptation({})).toBeUndefined();
  });

  it.each([
    ["a run that is not on record", null],
    ["a cancelled run", runThat("cancelled", { performed: true, verdict: "answers" })],
    ["a failed run", runThat("failed", { performed: true, verdict: "answers" })],
    ["a run nothing judged", runThat("succeeded")],
    ["a run whose check was not performed", runThat("succeeded", { performed: false, verdict: "answers" })],
    ["a refuted run", runThat("succeeded", { performed: true, verdict: "does_not_answer" })]
  ])("refuses %s, and reads and writes nothing", async (_name, session) => {
    const { ports, saveFlowInternal, resolveFlowNodeAdaptationTarget } = portsFor(session);
    await expect(applyProjectPartPinnedRepair(ports, adaptation, change, 1)).rejects.toThrow(/^part\.repair_not_judged: /u);
    expect(resolveFlowNodeAdaptationTarget).not.toHaveBeenCalled();
    expect(saveFlowInternal).not.toHaveBeenCalled();
  });

  it("refuses a judged run in which no step finished this version", async () => {
    const session = { ...runThat("succeeded", { performed: true, verdict: "answers" }), trace: { attempts: [] } } as unknown as AutomationStudioRuntimeSession;
    const { ports, saveFlowInternal } = portsFor(session);
    await expect(applyProjectPartPinnedRepair(ports, adaptation, change, 1)).rejects.toThrow(/^part\.repair_not_run: /u);
    expect(saveFlowInternal).not.toHaveBeenCalled();
  });

  it("refuses an adaptation that carries more than one change", async () => {
    const { ports } = portsFor(runThat("succeeded", { performed: true, verdict: "answers" }));
    await expect(applyProjectPartPinnedRepair(ports, { ...adaptation, patch: [change, change] }, change, 1)).rejects.toThrow(/names one unit and changes nothing else/u);
  });
});
