import { expect, it } from "vitest";
import { packReusableModelContext } from "../../../../runtime/models/context/index.ts";
import { packAutomationStudioReusableLlmContext } from "../reusable-llm-context.ts";

it("keeps the legacy packer as the exact canonical function", () => {
  expect(packAutomationStudioReusableLlmContext).toBe(packReusableModelContext);
});
