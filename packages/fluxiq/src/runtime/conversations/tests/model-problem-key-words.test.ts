import { describe, expect, it } from "vitest";
import { AutomationStudioLlmProviderError } from "../../models/index.ts";
import { automationStudioConversationModelProblem } from "../instructions/index.ts";

const problem = (message: string) => automationStudioConversationModelProblem(new AutomationStudioLlmProviderError("llm.provider_secret_unavailable", message));

describe("what a person reads when the model key cannot be used", () => {
  it("says no key is set up, and where to add one, and never claims a saved key", () => {
    const words = problem("There is no enabled DeepSeek key of yours in Secret Keys.");
    expect(words).toContain("no model key is set up yet");
    expect(words).toContain("Settings, under AI keys");
    expect(words).not.toMatch(/saved/u);
  });

  it("keeps its own words for a saved key that needs one sign-in to upgrade", () => {
    expect(problem("This saved key requires recovery from its original encryption material.")).toContain("needs one sign-in to the panel to upgrade it");
  });
});
