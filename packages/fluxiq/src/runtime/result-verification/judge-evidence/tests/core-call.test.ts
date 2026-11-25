// Core's own calls and bookkeeping steps never reach a host's judge-evidence projector (t1032, with t1029's finding): Core's
// tools but the four that run the host's nodes, and Core's control-flow and timing nodes. Everything else is the host's.
import { describe, expect, it } from "vitest";
import { automationStudioJudgeEvidenceIsCoreCall } from "../core-call.ts";
import { automationStudioProjectJudgeEvidence } from "../project.ts";

describe("Core's own calls", () => {
  it("are Core's tools, and Core's control-flow and timing nodes", () => {
    for (const id of ["core.set_result_processing", "core.recall_result", "core.loop_decision", "builtin.control.merge", "builtin.control.for-each", "builtin.timing.wait"]) expect(automationStudioJudgeEvidenceIsCoreCall(id), id).toBe(true);
  });

  it("are never the tools that run the host's nodes, a data node, a host's node, or a step that names none", () => {
    for (const id of ["core.run_node", "core.run_nodes", "core.run_part", "core.run_flow", "builtin.data.constant", "example.read_list", undefined]) expect(automationStudioJudgeEvidenceIsCoreCall(id), String(id)).toBe(false);
  });

  it("are projected by Core with no gap, and the host's projector is never handed them", () => {
    const handed: unknown[] = [];
    const projector = (input: { definitionId?: string | undefined }) => {
      handed.push(input.definitionId);
      return { role: "observation" as const, missing: ["host.unread"] };
    };
    for (const definitionId of ["core.set_result_processing", "builtin.timing.wait"]) {
      expect(automationStudioProjectJudgeEvidence({ source: "call", definitionId, evidence: { evidence: { changed: true } } }, projector, [])).toEqual({ role: "observation", evidence: {}, missing: [], withheld: false });
    }
    expect(handed).toEqual([]);
    expect(automationStudioProjectJudgeEvidence({ source: "call", definitionId: "example.read_list", evidence: { evidence: {} } }, projector, []).missing).toEqual(["host.unread"]);
    expect(handed).toEqual(["example.read_list"]);
  });
});
