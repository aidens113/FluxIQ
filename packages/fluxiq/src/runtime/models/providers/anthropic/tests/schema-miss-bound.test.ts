// t1038: a miss's rule is told within the bound a reply account carries (`../../../failures/reply-account.ts`), so a
// long option list reaches the model cut to fit, never dropped and never with the bound raised.
import { describe, expect, it } from "vitest";
import { automationStudioLlmProviderReplyAccount } from "../../../failures/index.ts";
import { automationStudioAnthropicSchemaMisses } from "../index.ts";

const NODES = Array.from({ length: 20 }, (_, at) => `web.output.dom-action-number-${at}`);

describe("a miss against a long list of options", () => {
  it("names as many as fit, says how many more the schema lists, and survives the account's bounds", () => {
    const misses = automationStudioAnthropicSchemaMisses({ node: "web.output.dom-snapshot" }, { type: "object", properties: { node: { enum: NODES } } });
    expect(misses).toHaveLength(1);
    expect(misses[0]!.rule).toMatch(/^must be one of "web\.output\.dom-action-number-0", .* or \d+ more the schema lists$/u);
    expect(misses[0]!.rule.length - "must ".length).toBeLessThanOrEqual(200);
    const account = automationStudioLlmProviderReplyAccount({ case: "content_off_shape", misses });
    expect(account?.misses).toEqual(misses);
  });

  it("names a short list whole, and an unsayable one by its count", () => {
    expect(automationStudioAnthropicSchemaMisses("c", { enum: ["a", "b"] })[0]!.rule).toBe("must be one of \"a\", \"b\"");
    expect(automationStudioAnthropicSchemaMisses("c", { enum: ["a/b", "c/d"] })[0]!.rule).toBe("must be one of the 2 values the schema lists");
    expect(automationStudioAnthropicSchemaMisses("c", { const: "x/y" })[0]!.rule).toBe("must be exactly the value the schema gives");
  });
});
