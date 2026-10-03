// The inputs a build's test ran on, as its judge is shown them, once beside the
// steps (t252 D4).
//
// A Flow input is declared by its first binding and tested at that binding's
// fallback (`flow-draft/flow-inputs.ts`); the test supplies none, so every step
// using it ran on that value. The judge reads a step's words with the input
// already resolved in them only where the domain wrote it so; this says, once,
// which values are the Flow's parameters rather than fixed text.
//
// A test value came from the instruction, but it is still screened as a step's
// words are: none under a denied key, none shaped like a credential or a
// locator. One that fails is said as withheld and its name kept.

import type { JsonValue } from "../../../../../core/index.ts";
import { automationStudioFlowDraftInputs, type AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import { automationStudioLocatorShapedText, automationStudioWithoutLocators, screenAutomationStudioLlmEvidence } from "../../llm/index.ts";
import type { AutomationStudioBuildTestInput } from "../contracts.ts";

/** What a test value the screen refused is said as, as a withheld row label is. */
const WITHHELD = "(withheld)";

/** The proposed steps' inputs at their test values, screened, and whether one was withheld. */
export function automationStudioBuildTestInputs(
  steps: readonly AutomationStudioFlowDraftStep[],
  deniedKeys: readonly string[]
): { inputs: AutomationStudioBuildTestInput[]; withheld: boolean } {
  let withheld = false;
  const inputs = automationStudioFlowDraftInputs(steps).inputs.flatMap((input): AutomationStudioBuildTestInput[] => {
    if (!input.name.trim() || automationStudioLocatorShapedText(input.name) || screenAutomationStudioLlmEvidence(input.name, []).secretShaped) {
      withheld = true;
      return [];
    }
    const test = screened(input.test, deniedKeys);
    if (test === undefined) withheld = true;
    return [{ name: input.name, test: test ?? WITHHELD, steps: [...input.steps] }];
  });
  return { inputs, withheld };
}

/** The value as sent, or nothing when anything in it is denied, credential-shaped or a locator. */
function screened(value: JsonValue, deniedKeys: readonly string[]): JsonValue | undefined {
  const screen = screenAutomationStudioLlmEvidence(value, deniedKeys);
  if (screen.deniedKey || screen.secretShaped) return undefined;
  return JSON.stringify(automationStudioWithoutLocators(value)) === JSON.stringify(value) ? value : undefined;
}
