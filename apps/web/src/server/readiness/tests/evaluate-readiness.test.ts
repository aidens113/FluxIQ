import { describe, expect, it } from "vitest";
import { evaluateReadiness } from "../index";

const ok = { initialized: true, draining: false, gatewayEnabled: true, gatewayListening: true };

describe("evaluateReadiness", () => {
  it("is ready when initialized, serving and listening", () => expect(evaluateReadiness(ok)).toEqual({ ready: true }));
  it("is ready without a gateway when it is disabled", () => expect(evaluateReadiness({ ...ok, gatewayEnabled: false, gatewayListening: false })).toEqual({ ready: true }));
  it("is not ready before initialization", () => expect(evaluateReadiness({ ...ok, initialized: false })).toEqual({ ready: false, reason: "starting" }));
  it("is not ready while draining, even when everything else is", () => expect(evaluateReadiness({ ...ok, draining: true })).toEqual({ ready: false, reason: "draining" }));
  it("is not ready when an enabled gateway is not listening", () => expect(evaluateReadiness({ ...ok, gatewayListening: false })).toEqual({ ready: false, reason: "gateway_not_listening" }));
});
