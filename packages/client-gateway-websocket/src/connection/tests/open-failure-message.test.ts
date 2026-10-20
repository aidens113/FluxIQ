import { describe, expect, it } from "vitest";
import { FluxIQClientGatewayOpenError } from "../../index.ts";
import { clientGatewayOpenFailureMessage } from "../index.ts";

// These strings are read by the Lab from the client's last error: they must
// stay character for character what the extension has always shown.
describe("clientGatewayOpenFailureMessage", () => {
  it("names open_timeout with the deadline in whole seconds, never less than one", () => {
    expect(clientGatewayOpenFailureMessage(new FluxIQClientGatewayOpenError("open_timeout", { timeoutMs: 10_000 })))
      .toBe("FluxIQ did not open the connection within 10 s (open_timeout).");
    expect(clientGatewayOpenFailureMessage(new FluxIQClientGatewayOpenError("open_timeout", { timeoutMs: 2_600 })))
      .toBe("FluxIQ did not open the connection within 3 s (open_timeout).");
    expect(clientGatewayOpenFailureMessage(new FluxIQClientGatewayOpenError("open_timeout", { timeoutMs: 30 })))
      .toBe("FluxIQ did not open the connection within 1 s (open_timeout).");
    expect(clientGatewayOpenFailureMessage(new FluxIQClientGatewayOpenError("open_timeout")))
      .toBe("FluxIQ did not open the connection within 1 s (open_timeout).");
  });

  it("names closed_before_open", () => {
    expect(clientGatewayOpenFailureMessage(new FluxIQClientGatewayOpenError("closed_before_open")))
      .toBe("FluxIQ closed the connection before it opened (closed_before_open).");
  });

  it("names open_failed", () => {
    expect(clientGatewayOpenFailureMessage(new FluxIQClientGatewayOpenError("open_failed")))
      .toBe("FluxIQ refused or dropped the connection before it opened (open_failed).");
  });

  it("says only that the connection failed for anything that is not an open failure", () => {
    expect(clientGatewayOpenFailureMessage(new Error("something else"))).toBe("WebSocket connection failed.");
    expect(clientGatewayOpenFailureMessage("not an error")).toBe("WebSocket connection failed.");
  });
});
