import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_ANTHROPIC_MODELS } from "../../../catalog/index.ts";
import { automationStudioAnthropicMessageBody } from "../request-body.ts";
import { automationStudioAnthropicOutputFormat } from "../schema.ts";

const FORMAT = automationStudioAnthropicOutputFormat({ type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false });
const body = (model: (typeof AUTOMATION_STUDIO_ANTHROPIC_MODELS)[number]) =>
  automationStudioAnthropicMessageBody({ model, system: "s", messages: [{ role: "user", content: "u" }], format: FORMAT });

describe("the Anthropic request body runs every model without thinking", () => {
  it("turns Haiku 5.5's thinking off with disabled, at its default effort", () => {
    const sent = body("claude-haiku-5-5");
    expect(sent.thinking).toEqual({ type: "disabled" });
    expect(sent.output_config).toEqual({ format: { type: "json_schema", schema: FORMAT.schema } });
  });

  it("turns Sonnet 5.5's thinking off with between_tools and no other thinking field, at its default effort", () => {
    const sent = body("claude-sonnet-5-5");
    expect(sent.thinking).toEqual({ type: "between_tools" });
    expect(sent.output_config).toEqual({ format: { type: "json_schema", schema: FORMAT.schema } });
  });

  it("runs Opus 5.5, whose thinking cannot be turned off, at low effort and sends no thinking field", () => {
    const sent = body("claude-opus-5-5");
    expect(sent).not.toHaveProperty("thinking");
    expect(sent.output_config).toEqual({ format: { type: "json_schema", schema: FORMAT.schema }, effort: "low" });
  });

  it("covers every model in the catalogue", () => {
    for (const model of AUTOMATION_STUDIO_ANTHROPIC_MODELS) {
      const sent = body(model);
      expect("thinking" in sent || (sent.output_config as { effort?: string }).effort === "low", model).toBe(true);
    }
  });
});
