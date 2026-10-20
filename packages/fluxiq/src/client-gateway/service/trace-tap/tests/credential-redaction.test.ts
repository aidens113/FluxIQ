import { describe, expect, it } from "vitest";
import { CLIENT_GATEWAY_TRACE_CREDENTIAL_FIELDS, redactClientGatewayTraceCredentials } from "../index.ts";

describe("redactClientGatewayTraceCredentials", () => {
  it("replaces a present credential with a declared redaction, copying along the path and leaving the live value alone", () => {
    const hello = { id: "m-1", type: "client.hello", payload: { clientId: "client.1", token: "secret-token", metadata: { a: 1 } } };
    const redacted = redactClientGatewayTraceCredentials(hello, CLIENT_GATEWAY_TRACE_CREDENTIAL_FIELDS["client.hello"] ?? []);
    expect(redacted.value).toEqual({ id: "m-1", type: "client.hello", payload: { clientId: "client.1", token: { redacted: "credential" }, metadata: { a: 1 } } });
    expect(redacted.redactions).toEqual([{ path: "/payload/token", reason: "credential" }]);
    expect(hello.payload.token).toBe("secret-token");
    expect(JSON.stringify(redacted.value)).not.toContain("secret-token");
  });

  it("declares nothing when the credential is absent", () => {
    const hello = { type: "client.hello", payload: { clientId: "client.1" } };
    const redacted = redactClientGatewayTraceCredentials(hello, [["payload", "token"]]);
    expect(redacted).toEqual({ value: hello, redactions: [] });
  });

  it("escapes a pointer's special characters", () => {
    const redacted = redactClientGatewayTraceCredentials({ "a/b": { "c~d": "x" } }, [["a/b", "c~d"]]);
    expect(redacted.redactions).toEqual([{ path: "/a~1b/c~0d", reason: "credential" }]);
  });
});
