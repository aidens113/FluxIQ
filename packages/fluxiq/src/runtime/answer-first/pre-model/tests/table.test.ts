// The table answers for every code a build refuses under before any model call, and nothing else,
// and its words are ones a person can act on: no code, no failure word, something to do.
import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_PHASE_FAILURE_CODES, FLOW_BOOTSTRAP_PROVIDER_PREFLIGHT_CODE_LIST } from "../../../flow-authoring/bootstrap/generation-failure/index.ts";
import { AUTOMATION_STUDIO_ANSWER_FIRST_PRE_MODEL, AUTOMATION_STUDIO_ANSWER_FIRST_PRE_MODEL_TABLE_IS_WHOLE, automationStudioAnswerFirstPreModelStep } from "../index.ts";

const LISTED = [...AUTOMATION_STUDIO_FLOW_BOOTSTRAP_PHASE_FAILURE_CODES.pre_provider_validation, ...AUTOMATION_STUDIO_FLOW_BOOTSTRAP_PHASE_FAILURE_CODES.provider_resolution, ...FLOW_BOOTSTRAP_PROVIDER_PREFLIGHT_CODE_LIST];

describe("the table of refusals before any model call", () => {
  it("names every code in the lists, and no other", () => {
    expect(new Set(Object.keys(AUTOMATION_STUDIO_ANSWER_FIRST_PRE_MODEL))).toEqual(new Set(LISTED));
    expect(LISTED.length).toBeGreaterThanOrEqual(35);
    expect(AUTOMATION_STUDIO_ANSWER_FIRST_PRE_MODEL_TABLE_IS_WHOLE).toEqual([true, true]);
  });

  it("gives each one words a person can read and act on", () => {
    for (const [code, step] of Object.entries(AUTOMATION_STUDIO_ANSWER_FIRST_PRE_MODEL)) {
      expect(step.say, code).toMatch(/\.$/u);
      expect(step.say, code).not.toMatch(/flow_bootstrap|pre_provider|fail(?:ed|ure) task/iu);
    }
  });

  it("answers nothing for a code it does not name, an inherited name among them", () => {
    expect(automationStudioAnswerFirstPreModelStep("flow_bootstrap.not_doable")).toBeUndefined();
    expect(automationStudioAnswerFirstPreModelStep("constructor")).toBeUndefined();
  });

  it("resolves what an attempt has no use for", () => {
    expect(automationStudioAnswerFirstPreModelStep("flow_bootstrap.pending_adaptation_exists")).toMatchObject({ does: "resolve", by: "not_asked" });
    expect(automationStudioAnswerFirstPreModelStep("flow_bootstrap.blank_target_required")).toMatchObject({ does: "resolve", by: "not_asked" });
    expect(automationStudioAnswerFirstPreModelStep("flow_bootstrap.active_instructions_required")).toMatchObject({ does: "setup" });
  });
});
