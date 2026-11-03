// The screen an untyped provider throw passes before anything publishes it.
import { describe, expect, it } from "vitest";

import { automationStudioLlmProviderThrowRead } from "../../throw-account/index.ts";
import { automationStudioLlmScreenedProviderThrow } from "../throw-screen.ts";

function screened(error: unknown) {
  const read = automationStudioLlmProviderThrowRead(error);
  return read ? automationStudioLlmScreenedProviderThrow(read) : undefined;
}

describe("a screened provider throw", () => {
  it("publishes the class, the cause's code and the message of a failed fetch", () => {
    expect(screened(new TypeError("fetch failed", { cause: { code: "ECONNRESET" } }))).toEqual({ errorClass: "TypeError", causeCode: "ECONNRESET", message: "fetch failed" });
  });

  it("keeps a host and port, which name the fault and not the request", () => {
    const cause = Object.assign(new Error("Connect Timeout Error (attempted address: api.deepseek.com:443, timeout: 10000ms)"), { name: "ConnectTimeoutError", code: "UND_ERR_CONNECT_TIMEOUT" });
    expect(screened(new TypeError("fetch failed", { cause }))?.message).toBe("fetch failed (cause: Connect Timeout Error (attempted address: api.deepseek.com:443, timeout: 10000ms))");
  });

  it.each([
    ["an authorization header", "request failed: Authorization: Bearer x"],
    ["a provider key", "invalid key sk-live0123456789abcdefghij"],
    ["a bearer credential", "rejected bearer abcdefghij0123456789klmnop"],
    ["an api key header name", "missing x-api-key"],
    ["a JSON web token", "bad eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"],
    ["a credential in the cause", undefined]
  ])("drops a message carrying %s and keeps the codes", (_label, message) => {
    const error = message === undefined
      ? new TypeError("fetch failed", { cause: Object.assign(new Error("echoed sk-live0123456789abcdefghij"), { code: "ECONNRESET" }) })
      : new TypeError(message, { cause: { code: "ECONNRESET" } });
    const account = screened(error);

    expect(account).toMatchObject({ errorClass: "TypeError", causeCode: "ECONNRESET", withheld: ["message_credential_shaped"] });
    expect(account).not.toHaveProperty("message");
    expect(JSON.stringify(account)).not.toMatch(/Bearer|sk-live|x-api-key|eyJ/iu);
  });

  it("drops a message holding a URL with a query string, or a payload", () => {
    expect(screened(new Error("GET https://api.example.test/v1/chat?session=abc failed"))).toEqual({ errorClass: "Error", withheld: ["message_url_query_shaped"] });
    expect(screened(new SyntaxError('bad body {"model":"deepseek-flash","messages":[]}'))).toEqual({ errorClass: "SyntaxError", withheld: ["message_payload_shaped"] });
  });

  it("drops a credential that lies past the bound rather than cutting it out of view", () => {
    expect(screened(new Error(`${"x ".repeat(200)}sk-live0123456789abcdefghij`))).toEqual({ errorClass: "Error", withheld: ["message_credential_shaped"] });
  });

  it("redacts a locator and cuts a long message, naming both", () => {
    const account = screened(new Error(`no element matching [data-testid="cart"] ${"x".repeat(400)}`));
    expect(account?.withheld).toEqual(["message_locator_shaped", "message_truncated"]);
    expect(account?.message?.length).toBeLessThanOrEqual(240);
    expect(account?.message).not.toContain("data-testid");
  });

  it("keeps the read's own omission", () => {
    expect(screened(new Proxy({}, { get() { throw new Error("no"); } }))).toEqual({ withheld: ["throw_unreadable"] });
  });
});
