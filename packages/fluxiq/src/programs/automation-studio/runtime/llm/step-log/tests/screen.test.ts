// The step log's credential screen: key and bearer-token shapes are replaced,
// and ordinary page text that only resembles them is written exactly as sent.
import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_LLM_STEP_LOG_REDACTED, automationStudioLlmStepLogScreen } from "../index.ts";

describe("the step log's credential screen", () => {
  it("replaces provider keys and bearer tokens", () => {
    for (const secret of [
      "sk-0123456789abcdef0123456789abcdef",
      "sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz012345",
      "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc"
    ]) {
      const screened = automationStudioLlmStepLogScreen(`before ${secret} after`);
      expect(screened).toEqual({ text: `before ${AUTOMATION_STUDIO_LLM_STEP_LOG_REDACTED} after`, redacted: true });
    }
  });

  it("leaves page text that only resembles a credential exactly as it was", () => {
    for (const text of [
      "<div class=\"sk-product-card-title\">Kettle</div>",
      "Payable to the bearer instrument holder",
      "task-0123456789abcdef0123456789",
      "Bearer token required"
    ]) {
      expect(automationStudioLlmStepLogScreen(text)).toEqual({ text, redacted: false });
    }
  });
});
