import { expect, it } from "vitest";
import { createAutomationStudioAnthropicProvider } from "../index.ts";

it("a host can bind Core's provider through the public automation entry without making a request", () => {
  const provider = createAutomationStudioAnthropicProvider({ secretReference: { kind: "secret_reference", id: "secret:host-binding" }, resolveSecret: async () => { throw new Error("No key should be requested by construction"); } });
  expect(provider.metadata.provider).toBe("anthropic");
  expect(typeof provider.runTask).toBe("function");
});
