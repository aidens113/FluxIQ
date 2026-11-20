// One attempt's place on the model ladder: it climbs one rung per cause, stays there, names each
// climb by the models its provider said, climbs nothing at the top or with no ladder, and a carried-on
// attempt brings its climbs back. A climb is a step folder and a chat step.
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { automationStudioActivityHub, runWithAutomationStudioActivity } from "../../../../activity/index.ts";
import { AUTOMATION_STUDIO_LLM_MODEL_LADDER, automationStudioLlmModelLadder, automationStudioLlmModelLadderClimb, automationStudioLlmModelLadderRung } from "../index.ts";

const MODELS = [...AUTOMATION_STUDIO_LLM_MODEL_LADDER];

describe("the model ladder", () => {
  it("is Haiku, then Sonnet, then Opus, cheapest first", () => {
    expect(MODELS).toEqual(["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"]);
    expect(automationStudioLlmModelLadderRung("claude-sonnet-5-5")).toBe(1);
    expect(automationStudioLlmModelLadderRung("deepseek-flash")).toBeUndefined();
  });

  it("climbs exactly one rung per cause, stays there, and records from, to and why", () => {
    const ladder = automationStudioLlmModelLadder();
    ladder.serve(MODELS);
    expect(ladder.level).toBe(0);
    expect(ladder.escalate({ reason: "loop_persisted", pattern: "near_repeat" })).toEqual({ from: "claude-haiku-5-5", to: "claude-sonnet-5-5", reason: "loop_persisted", pattern: "near_repeat" });
    expect(ladder.level).toBe(1);
    // Serving again does not move it back: the climb is sticky.
    ladder.serve(MODELS);
    expect(ladder.level).toBe(1);
    expect(ladder.escalate({ reason: "repair_failed" })).toEqual({ from: "claude-sonnet-5-5", to: "claude-opus-5-5", reason: "repair_failed" });
    expect(ladder.level).toBe(2);
    expect(ladder.data()).toEqual({ base: "claude-haiku-5-5", escalations: [
      { from: "claude-haiku-5-5", to: "claude-sonnet-5-5", reason: "loop_persisted", pattern: "near_repeat" },
      { from: "claude-sonnet-5-5", to: "claude-opus-5-5", reason: "repair_failed" }
    ] });
  });

  it("climbs nothing at the top, or where no provider on the ladder has served", () => {
    const top = automationStudioLlmModelLadder();
    top.serve(["claude-opus-5-5"]);
    expect(top.escalate({ reason: "completion_refused_again" })).toBeUndefined();
    expect(top.level).toBe(0);
    const none = automationStudioLlmModelLadder();
    expect(none.escalate({ reason: "completion_refused_again" })).toBeUndefined();
    expect(none.data()).toBeUndefined();
  });

  it("starts a new attempt on its base rung, and brings a carried-on attempt's climbs back", () => {
    const first = automationStudioLlmModelLadder();
    first.serve(MODELS);
    first.escalate({ reason: "model_decided" });
    expect(automationStudioLlmModelLadder().level).toBe(0);
    const carried = automationStudioLlmModelLadder(first.data());
    carried.serve(MODELS);
    expect(carried.level).toBe(1);
  });

  it("is a step folder the Lab reads and one chat step, where it climbed", () => {
    const directory = mkdtempSync(join(tmpdir(), "ladder-steps-"));
    const seen: ClientGatewayActivity[] = [];
    const stop = automationStudioActivityHub.subscribe((event) => seen.push(event));
    try {
      const ladder = automationStudioLlmModelLadder();
      ladder.serve(MODELS);
      runWithAutomationStudioActivity({ kind: "build", id: "b1", projectId: "p1" }, () => automationStudioLlmModelLadderClimb(ladder, { reason: "no_new_evidence", pattern: "no_progress" }, 7, { FLUXIQ_LLM_STEP_LOG_DIR: directory }));
      const folders = readdirSync(directory).filter((name) => /^\d{4,}-escalate$/u.test(name));
      expect(folders).toHaveLength(1);
      const meta = JSON.parse(readFileSync(join(directory, folders[0]!, "meta.json"), "utf8")) as Record<string, unknown>;
      expect(meta).toMatchObject({ kind: "escalate", iteration: 7, from: "claude-haiku-5-5", to: "claude-sonnet-5-5", reason: "no_new_evidence", pattern: "no_progress", level: 1 });
      expect(seen.filter((event) => event.detail?.kind === "thought").map((event) => event.detail?.title)).toEqual(["Switched to a stronger model"]);
      // At the top nothing is written.
      ladder.escalate({ reason: "model_decided" });
      automationStudioLlmModelLadderClimb(ladder, { reason: "model_decided" }, 8, { FLUXIQ_LLM_STEP_LOG_DIR: directory });
      expect(readdirSync(directory).filter((name) => /-escalate$/u.test(name))).toHaveLength(1);
    } finally {
      stop();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
