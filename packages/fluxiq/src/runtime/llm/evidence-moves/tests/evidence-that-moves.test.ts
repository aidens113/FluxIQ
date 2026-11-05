// The names in `../evidence-that-moves.ts` are written there so the file takes no
// edge into the loop's handlers. These hold them to their owners, and hold every kind
// of note the loop takes back out of the window to being one that rides after the marker.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID } from "../../../flow-authoring/draft/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_CURRENT_FLOW_TOOL_ID } from "../../context-window.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_REFUSAL_RUN_TOOL_ID, AUTOMATION_STUDIO_LLM_EVIDENCE_RERUN_RESULT_TOOL_ID, AUTOMATION_STUDIO_LLM_EVIDENCE_SEARCH_CHECK_TOOL_ID, AUTOMATION_STUDIO_LLM_EVIDENCE_STALL_RECOVERY_TOOL_ID } from "../../decision-handlers/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_AMENDMENT_FEEDBACK_TOOL_ID } from "../../draft-amendment-feedback/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_FEEDBACK_TOOL_ID, AUTOMATION_STUDIO_LLM_EVIDENCE_REQUEST_CHECK_TOOL_ID } from "../../evidence-loop/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_NO_PROGRESS_TOOL_ID } from "../../evidence-progress/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_BUDGET_TOOL_ID } from "../../loop-budget.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_CHECK_TOOL_ID, AUTOMATION_STUDIO_LLM_EVIDENCE_REPEAT_CHECK_TOOL_ID } from "../../repeat-guard/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_FEEDBACK_TOOL_ID } from "../../unusable-decision.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_HISTORY_TOOL_ID } from "../../decision-context/index.ts";
import { AUTOMATION_STUDIO_LLM_PASSING_NOTE_TOOL_IDS, automationStudioLlmEvidenceEntryMoves } from "../index.ts";

const moves = (toolId: string, callId = toolId) => automationStudioLlmEvidenceEntryMoves({ callId, toolId });

describe("what changes between one decision and the next", () => {
  it("names what Core writes afresh for every decision", () => {
    for (const toolId of [AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID, AUTOMATION_STUDIO_LLM_EVIDENCE_HISTORY_TOOL_ID, AUTOMATION_STUDIO_LLM_EVIDENCE_BUDGET_TOOL_ID, AUTOMATION_STUDIO_LLM_EVIDENCE_CURRENT_FLOW_TOOL_ID, "core.current_view"]) expect(moves(toolId), toolId).toBe(true);
  });

  it("names every note a newer one or a later call takes away", () => {
    for (const toolId of [
      AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_FEEDBACK_TOOL_ID, AUTOMATION_STUDIO_LLM_EVIDENCE_NO_PROGRESS_TOOL_ID, AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_FEEDBACK_TOOL_ID, AUTOMATION_STUDIO_LLM_EVIDENCE_AMENDMENT_FEEDBACK_TOOL_ID,
      AUTOMATION_STUDIO_LLM_EVIDENCE_REQUEST_CHECK_TOOL_ID, AUTOMATION_STUDIO_LLM_EVIDENCE_REPEAT_CHECK_TOOL_ID, AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_CHECK_TOOL_ID, AUTOMATION_STUDIO_LLM_EVIDENCE_SEARCH_CHECK_TOOL_ID,
      AUTOMATION_STUDIO_LLM_EVIDENCE_REFUSAL_RUN_TOOL_ID, AUTOMATION_STUDIO_LLM_EVIDENCE_RERUN_RESULT_TOOL_ID, AUTOMATION_STUDIO_LLM_EVIDENCE_STALL_RECOVERY_TOOL_ID, "core.rerun_check"
    ]) expect(AUTOMATION_STUDIO_LLM_PASSING_NOTE_TOOL_IDS, toolId).toContain(toolId);
  });

  it("leaves a tool's result, a route state and Core's fixed notes settled", () => {
    for (const toolId of ["core.run_node", "core.route_state", "core.described_nodes", "core.attempt_note", "core.resumed"]) expect(moves(toolId), toolId).toBe(false);
    expect(moves("core.run_nodes", "call.7")).toBe(false);
    expect(moves("core.run_nodes", "core.run_nodes.available.7")).toBe(true);
  });

  it("is told of any new kind of note the loop takes back out of the window", () => {
    // Every id handed to the one function that removes entries, in the loop's own source, is either named above or the dry run's, which is left in place on purpose: it is large, and only a new completion attempt takes it away.
    const root = path.resolve(import.meta.dirname, "../..");
    const files = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
      const at = path.join(dir, name);
      return statSync(at).isDirectory() ? (name === "tests" ? [] : files(at)) : name.endsWith(".ts") && name !== "supersede.ts" ? [at] : [];
    });
    const known = new Map<string, string>([
      ["AUTOMATION_STUDIO_LLM_EVIDENCE_REQUEST_CHECK_TOOL_ID", AUTOMATION_STUDIO_LLM_EVIDENCE_REQUEST_CHECK_TOOL_ID], ["AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_FEEDBACK_TOOL_ID", AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_FEEDBACK_TOOL_ID],
      ["AUTOMATION_STUDIO_LLM_EVIDENCE_REPEAT_CHECK_TOOL_ID", AUTOMATION_STUDIO_LLM_EVIDENCE_REPEAT_CHECK_TOOL_ID], ["AUTOMATION_STUDIO_LLM_EVIDENCE_NO_PROGRESS_TOOL_ID", AUTOMATION_STUDIO_LLM_EVIDENCE_NO_PROGRESS_TOOL_ID],
      ["AUTOMATION_STUDIO_LLM_EVIDENCE_REFUSAL_RUN_TOOL_ID", AUTOMATION_STUDIO_LLM_EVIDENCE_REFUSAL_RUN_TOOL_ID], ["AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_FEEDBACK_TOOL_ID", AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_FEEDBACK_TOOL_ID],
      ["AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_CHECK_TOOL_ID", AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_CHECK_TOOL_ID], ["AUTOMATION_STUDIO_LLM_EVIDENCE_SEARCH_CHECK_TOOL_ID", AUTOMATION_STUDIO_LLM_EVIDENCE_SEARCH_CHECK_TOOL_ID],
      ["AUTOMATION_STUDIO_LLM_EVIDENCE_RERUN_RESULT_TOOL_ID", AUTOMATION_STUDIO_LLM_EVIDENCE_RERUN_RESULT_TOOL_ID], ["AUTOMATION_STUDIO_LLM_EVIDENCE_AMENDMENT_FEEDBACK_TOOL_ID", AUTOMATION_STUDIO_LLM_EVIDENCE_AMENDMENT_FEEDBACK_TOOL_ID],
      ["AUTOMATION_STUDIO_LLM_EVIDENCE_STALL_RECOVERY_TOOL_ID", AUTOMATION_STUDIO_LLM_EVIDENCE_STALL_RECOVERY_TOOL_ID]
    ]);
    const leftInPlace = new Set(["AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_TOOL_ID", "AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_PAGE_TOOL_ID"]);
    const handedOver = new Set<string>();
    const call = /automationStudioLlmDecisionContextSupersede\((?:[^,()]+),\s*([^()]*?)\)/gu;
    const callback = /toolId:\s*(AUTOMATION_STUDIO_[A-Z_]+)/u;
    for (const file of files(root)) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(call)) for (const name of match[1]!.split(",").map((part) => part.trim()).filter(Boolean)) handedOver.add(name);
      if (source.includes("input.toolId") && source.includes("automationStudioLlmDecisionContextSupersede(input.evidence, input.toolId)")) {
        const caller = callback.exec(source)?.[1];
        if (caller) handedOver.add(caller);
      }
    }
    expect(handedOver.size).toBeGreaterThan(5);
    for (const name of handedOver) {
      if (leftInPlace.has(name) || name === "input.toolId") continue;
      const id = name.startsWith('"') ? name.slice(1, -1) : known.get(name);
      expect(id, `${name} is taken back out of the window: name it in evidence-that-moves.ts and here`).toBeDefined();
      expect(AUTOMATION_STUDIO_LLM_PASSING_NOTE_TOOL_IDS, name).toContain(id);
    }
  });
});
