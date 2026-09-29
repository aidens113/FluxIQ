// What an untyped provider throw is read as, before the harness screens it.
//
// `provider-contract.ts` is imported first on purpose: it is the lowest module in
// this graph, and `throw-account/` must stay a leaf -- reaching the harness
// from here closes a cycle that leaves the DeepSeek adapter's locator screen
// undefined. Entering from this side makes such an edge fail in this file.
import { describe, expect, it } from "vitest";

import { AutomationStudioLlmProviderError, normalizedAutomationStudioLlmProviderFailure } from "../../provider-contract.ts";
import { automationStudioLlmProviderThrowRead } from "../index.ts";

describe("an untyped provider throw, as read", () => {
  it("names the class and the cause's code of a failed fetch, and holds the message apart", () => {
    const failure = normalizedAutomationStudioLlmProviderFailure(new TypeError("fetch failed", { cause: { code: "ECONNRESET" } }));

    expect(failure.code).toBe("llm.provider_request_failed");
    expect(failure.thrown).toEqual({ account: { errorClass: "TypeError", causeCode: "ECONNRESET" }, unscreenedMessage: "fetch failed" });
  });

  it("reads a cause that is an error of its own, and joins its message when it says something new", () => {
    const cause = Object.assign(new Error("Connect Timeout Error\n(attempted address: api.deepseek.com:443)"), { name: "ConnectTimeoutError", code: "UND_ERR_CONNECT_TIMEOUT" });
    expect(automationStudioLlmProviderThrowRead(new TypeError("fetch failed", { cause }))).toEqual({
      account: { errorClass: "TypeError", causeClass: "ConnectTimeoutError", causeCode: "UND_ERR_CONNECT_TIMEOUT" },
      unscreenedMessage: "fetch failed (cause: Connect Timeout Error (attempted address: api.deepseek.com:443))"
    });
  });

  it("keeps a Node system error's own code, and no class or code that is a sentence", () => {
    const error = Object.assign(new Error("getaddrinfo ENOTFOUND api.deepseek.com"), { code: "ENOTFOUND" });
    expect(automationStudioLlmProviderThrowRead(error)?.account).toEqual({ errorClass: "Error", errorCode: "ENOTFOUND" });
    expect(automationStudioLlmProviderThrowRead({ name: "not a class", code: "not a code", message: "m" })).toEqual({ account: {}, unscreenedMessage: "m" });
  });

  it("says a throw could not be read rather than failing the report of it", () => {
    const hostile = new Proxy({}, { get() { throw new Error("no"); } });
    expect(automationStudioLlmProviderThrowRead(hostile)).toEqual({ account: { withheld: ["throw_unreadable"] } });
    expect(normalizedAutomationStudioLlmProviderFailure(hostile).thrown).toEqual({ account: { withheld: ["throw_unreadable"] } });
  });

  it("offers nothing for a throw that says nothing, and nothing beside a typed failure", () => {
    expect(automationStudioLlmProviderThrowRead(undefined)).toBeUndefined();
    expect(automationStudioLlmProviderThrowRead({})).toBeUndefined();
    const typed = normalizedAutomationStudioLlmProviderFailure(new AutomationStudioLlmProviderError("llm.provider_network_error", "socket hang up with sk-live0123456789abcdefghij", true));
    expect(typed).not.toHaveProperty("thrown");
    expect(JSON.stringify(typed)).not.toContain("sk-live");
  });
});
