import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_CLIENT_GATEWAY_TRACE_ENV, automationStudioClientGatewayTraceEnabled } from "../index.ts";

describe("automationStudioClientGatewayTraceEnabled", () => {
  it("reads FLUXIQ_CLIENT_GATEWAY_TRACE", () => {
    expect(AUTOMATION_STUDIO_CLIENT_GATEWAY_TRACE_ENV).toBe("FLUXIQ_CLIENT_GATEWAY_TRACE");
  });

  it.each(["1", "true", "on", " TRUE ", "On"])("is on for %j", (value) => {
    expect(automationStudioClientGatewayTraceEnabled({ FLUXIQ_CLIENT_GATEWAY_TRACE: value })).toBe(true);
  });

  it.each([undefined, "", "  ", "0", "false", "off", "OFF"])("is off for %j", (value) => {
    expect(automationStudioClientGatewayTraceEnabled({ FLUXIQ_CLIENT_GATEWAY_TRACE: value })).toBe(false);
  });

  it("is off when the variable is absent", () => {
    expect(automationStudioClientGatewayTraceEnabled({})).toBe(false);
  });

  it.each(["yes", "2", "enabled", "tru"])("refuses %j, naming the variable and the accepted values", (value) => {
    expect(() => automationStudioClientGatewayTraceEnabled({ FLUXIQ_CLIENT_GATEWAY_TRACE: value })).toThrow(
      "FLUXIQ_CLIENT_GATEWAY_TRACE must be 1, true or on to trace client gateway episodes, or unset, 0, false or off for none."
    );
  });
});
