// A refusal record is only worth carrying if a reader can trust its shape.
//
// The record the DeepSeek adapter builds is screened where it is built -- the
// message through Core's locator screen, dropped whole if it carries the
// credential; `code`, `type` and `param` as plain identifiers; the request as
// counts and ids. It then rides on the thrown failure as a JSON string, which is
// how a reader used to receive it: a string of unknown shape, so nothing read
// it. These tests hold the seam that types it, and the bounds it refuses to
// carry past.

import { describe, expect, it } from "vitest";
import {
  AUTOMATION_STUDIO_LLM_PROVIDER_REFUSAL_LIMITS,
  parseAutomationStudioLlmProviderRefusal
} from "../index.ts";

const SCREENED = {
  status: 400,
  contentType: "application/json",
  bodyBytes: 148,
  error: { code: "invalid_value", type: "invalid_request_error", param: "messages[1].content", message: "Invalid value for 'max_tokens': must be at most 8192" },
  withheld: ["message_locator_shaped"],
  request: {
    model: "deepseek-flash",
    taskKind: "flow_bootstrap",
    requestId: "llm.flow_bootstrap.7f1c",
    messages: [{ role: "system", bytes: 2_400, empty: false }, { role: "user", bytes: 18_112, empty: false }],
    tokens: { measuredInput: 5_012, declaredInput: 5_007, inputHeadroom: 42_988 },
    malformed: ["context.instructions", "estimatedInputTokens"]
  }
};

describe("the refusal record a provider failure carries", () => {
  it("reads the same record from the object and from the JSON an adapter encoded it as", () => {
    const fromObject = parseAutomationStudioLlmProviderRefusal(SCREENED);
    const fromText = parseAutomationStudioLlmProviderRefusal(JSON.stringify(SCREENED));

    expect(fromObject).toEqual(fromText);
    expect(fromText).toEqual({
      status: 400,
      contentType: "application/json",
      bodyBytes: 148,
      error: { code: "invalid_value", type: "invalid_request_error", param: "messages[1].content", message: "Invalid value for 'max_tokens': must be at most 8192" },
      withheld: ["message_locator_shaped"],
      request: SCREENED.request
    });
  });

  it("is absent, rather than empty, where there is no record to read", () => {
    expect(parseAutomationStudioLlmProviderRefusal(undefined)).toBeUndefined();
    expect(parseAutomationStudioLlmProviderRefusal("DeepSeek returned an unsuccessful HTTP status.")).toBeUndefined();
    expect(parseAutomationStudioLlmProviderRefusal("{ not json")).toBeUndefined();
    expect(parseAutomationStudioLlmProviderRefusal([SCREENED])).toBeUndefined();
  });

  it("refuses a record with no status, because the status is what the record is about", () => {
    for (const status of [undefined, null, 99, 600, 400.5, "400"]) {
      expect(parseAutomationStudioLlmProviderRefusal({ ...SCREENED, status })).toBeUndefined();
    }
  });

  it("refuses a record whose own account of what it withheld cannot be read", () => {
    expect(parseAutomationStudioLlmProviderRefusal({ ...SCREENED, withheld: "message_truncated" })).toBeUndefined();
    expect(parseAutomationStudioLlmProviderRefusal({ ...SCREENED, withheld: ["Body Unreadable"] })).toBeUndefined();
    expect(parseAutomationStudioLlmProviderRefusal({
      ...SCREENED,
      withheld: Array.from({ length: AUTOMATION_STUDIO_LLM_PROVIDER_REFUSAL_LIMITS.withheldEntries + 1 }, (_, index) => `entry_${index}`)
    })).toBeUndefined();
  });

  it("bounds the provider's sentence and says that it did", () => {
    const long = `${"a".repeat(AUTOMATION_STUDIO_LLM_PROVIDER_REFUSAL_LIMITS.messageLength)}TAIL_BEYOND_THE_BOUND`;
    const record = parseAutomationStudioLlmProviderRefusal({ ...SCREENED, withheld: [], error: { ...SCREENED.error, message: long } });

    expect(record?.error?.message).toHaveLength(AUTOMATION_STUDIO_LLM_PROVIDER_REFUSAL_LIMITS.messageLength);
    expect(record?.withheld).toEqual(["message_truncated"]);
    expect(JSON.stringify(record)).not.toContain("TAIL_BEYOND_THE_BOUND");
  });

  it("drops an error field that is not a name, and names the omission once", () => {
    const record = parseAutomationStudioLlmProviderRefusal({
      ...SCREENED,
      withheld: [],
      error: { code: { nested: true }, type: "invalid_request_error", param: "[data-testid=\"cart-total\"]", message: "Bad request." }
    });

    expect(record?.error).toEqual({ code: null, type: "invalid_request_error", param: null, message: "Bad request." });
    expect(record?.withheld).toEqual(["error_fields_unnamed"]);
    expect(JSON.stringify(record)).not.toContain("data-testid");
  });

  it("keeps the producer's own omissions beside the ones it adds, without repeating either", () => {
    const record = parseAutomationStudioLlmProviderRefusal({
      ...SCREENED,
      withheld: ["body_not_json", "error_fields_unnamed"],
      error: { code: 42, type: null, param: "max_tokens", message: null }
    });

    // A numeric code is not a name here -- the adapter renders one as its
    // decimal before this point -- and the entry the producer already recorded
    // is not added twice.
    expect(record?.withheld).toEqual(["body_not_json", "error_fields_unnamed"]);
    expect(record?.error).toEqual({ code: null, type: null, param: "max_tokens", message: null });
  });

  it("carries no request shape that holds anything but names, counts and ids", () => {
    const prose = parseAutomationStudioLlmProviderRefusal({
      ...SCREENED,
      withheld: [],
      request: { ...SCREENED.request, instruction: "Add the cheapest hotel in Rome to the cart" }
    });
    const locator = parseAutomationStudioLlmProviderRefusal({
      ...SCREENED,
      withheld: [],
      request: { ...SCREENED.request, target: "[aria-label=\"Add to cart\"]" }
    });

    expect(prose?.request).toBeNull();
    expect(prose?.withheld).toEqual(["request_unpublishable"]);
    expect(JSON.stringify(prose)).not.toContain("cheapest hotel");
    expect(locator?.request).toBeNull();
    expect(locator?.withheld).toEqual(["request_unpublishable"]);
    expect(JSON.stringify(locator)).not.toContain("aria-label");
  });

  it("refuses a request shape nested deeper than a shape needs to be", () => {
    let nested: unknown = { leaf: "ok" };
    for (let depth = 0; depth < AUTOMATION_STUDIO_LLM_PROVIDER_REFUSAL_LIMITS.requestDepth + 1; depth += 1) nested = { nested };
    const record = parseAutomationStudioLlmProviderRefusal({ ...SCREENED, withheld: [], request: nested });

    expect(record?.request).toBeNull();
    expect(record?.withheld).toEqual(["request_unpublishable"]);
  });

  it("keeps a declared media type with its parameters, and nothing shaped like a way to address an element", () => {
    const proxied = parseAutomationStudioLlmProviderRefusal({ ...SCREENED, contentType: "text/html; charset=utf-8", error: null, withheld: ["body_not_json"] });
    const forged = parseAutomationStudioLlmProviderRefusal({ ...SCREENED, contentType: "text/html [data-testid=\"x\"]" });
    const absent = parseAutomationStudioLlmProviderRefusal({ ...SCREENED, contentType: null, bodyBytes: null, error: null, withheld: ["body_unreadable"] });

    expect(proxied?.contentType).toBe("text/html; charset=utf-8");
    expect(proxied?.error).toBeNull();
    expect(forged?.contentType).toBeNull();
    expect(absent).toMatchObject({ contentType: null, bodyBytes: null, error: null, withheld: ["body_unreadable"] });
  });
});
