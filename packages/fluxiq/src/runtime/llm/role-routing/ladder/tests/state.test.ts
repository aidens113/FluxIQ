// Historical escalation is readable but inert; compatibility calls cannot switch a model or log a switch.
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { automationStudioActivityHub, runWithAutomationStudioActivity } from "../../../../activity/index.ts";
import { AUTOMATION_STUDIO_LLM_MODEL_LADDER, automationStudioLlmModelLadder, automationStudioLlmModelLadderClimb, automationStudioLlmModelLadderRung } from "../index.ts";

const MODELS = [...AUTOMATION_STUDIO_LLM_MODEL_LADDER];

describe("inert historical model ladders", () => {
  it("keeps the legacy catalog readable without making it executable", () => {
    expect(automationStudioLlmModelLadderRung("claude-sonnet-5-5")).toBe(1);
    expect(automationStudioLlmModelLadderRung("custom")).toBeUndefined();
    const ladder = automationStudioLlmModelLadder();
    ladder.serve(MODELS);
    expect(ladder.models).toEqual([MODELS[0]]);
    for (const reason of ["model_decided", "loop_detected", "no_new_evidence", "loop_persisted", "completion_refused_again", "repair_failed"] as const) {
      expect(ladder.escalate({ reason })).toBeUndefined();
    }
    expect(ladder.level).toBe(0);
    expect(ladder.data()).toEqual({ base: MODELS[0], escalations: [] });
  });

  it("retains old records without restoring their serving level, and does not mutate the seed", () => {
    const seed = { base: MODELS[0]!, escalations: [{ from: MODELS[0]!, to: MODELS[2]!, reason: "model_decided" as const }] };
    const ladder = automationStudioLlmModelLadder(seed);
    ladder.serve(MODELS);
    expect(ladder.level).toBe(0);
    expect(ladder.data()).toEqual(seed);
    expect(ladder.data()).not.toBe(seed);
    ladder.escalate({ reason: "repair_failed" });
    expect(ladder.data()).toEqual(seed);
  });

  it("emits neither a switch event nor a step file even for a legacy caller-supplied ladder", () => {
    const directory = mkdtempSync(join(tmpdir(), "fixed-model-"));
    const seen: ClientGatewayActivity[] = [];
    const stop = automationStudioActivityHub.subscribe((event) => seen.push(event));
    try {
      const ladder = automationStudioLlmModelLadder();
      const escalate = () => { throw new Error("retired escalation must never be invoked"); };
      runWithAutomationStudioActivity({ kind: "build", id: "b1", projectId: "p1" }, () => automationStudioLlmModelLadderClimb({ ...ladder, escalate }, { reason: "loop_persisted" }, 1, { FLUXIQ_LLM_STEP_LOG_DIR: directory }));
      expect(readdirSync(directory)).toEqual([]);
      expect(seen).toEqual([]);
    } finally {
      stop();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
