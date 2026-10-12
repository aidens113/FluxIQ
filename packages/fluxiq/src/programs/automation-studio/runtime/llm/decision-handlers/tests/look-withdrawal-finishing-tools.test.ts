// Withdrawing looks never takes away the tools that finish a candidate. Lane C
// `run-mv0pa79q-ef91811b` (steps 0019, 0021): with looks withdrawn the build was
// offered only `core.run_node` and `core.test_candidate`, because
// `core.submit_candidate` is declared `observe`, and could not submit its Flow.

import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmEvidenceTool } from "../../evidence-loop/index.ts";
import { automationStudioLlmEvidenceLookWithdrawal } from "../look-withdrawal.ts";

const tool = (toolId: string, effect: "observe" | "mutate"): AutomationStudioLlmEvidenceTool => ({
  toolId,
  description: toolId,
  inputSchema: { type: "object", properties: {} },
  effect
});

const submit = tool("core.submit_candidate", "observe");
const trial = tool("core.test_candidate", "observe");
const look = tool("core.read_page", "observe");
const act = tool("core.click", "mutate");

function withdrawn() {
  const looks = automationStudioLlmEvidenceLookWithdrawal({ enabled: true });
  looks.redirectShown(1);
  expect(looks.askedAgain(2, 0)).toBe(true);
  expect(looks.active(0)).toBe(true);
  return looks;
}

describe("look withdrawal and the candidate finishing tools", () => {
  it("keeps submit and trial on offer and drops other observe tools", () => {
    const offered = withdrawn().offer([submit, trial, look, act], 0).map((entry) => entry.toolId);
    expect(offered).toEqual(["core.submit_candidate", "core.test_candidate", "core.click"]);
  });

  it("does not refuse a submit or trial call, and still refuses another look", () => {
    const looks = withdrawn();
    expect(looks.refuses(submit, {}, 0)).toBe(false);
    expect(looks.refuses(trial, {}, 0)).toBe(false);
    expect(looks.refuses(look, {}, 0)).toBe(true);
  });

  it("offers everything again once an action runs", () => {
    const offered = withdrawn().offer([submit, look], 1).map((entry) => entry.toolId);
    expect(offered).toEqual(["core.submit_candidate", "core.read_page"]);
  });
});
