// How a differing delivery point is classified, and how differences are read
// (P3): a noted gap or another payload schema is a capture gap, ids and times
// Core minted alone are nondeterminism, anything else an intake defect; key
// order counts in a payload.

import { describe, expect, it } from "vitest";
import { classifyClientGatewayTraceDivergence, clientGatewayTraceJsonDifferences } from "../index.ts";

describe("classifying a divergence", () => {
  it("puts a noted gap and a schema change first, minted ids and times next, and anything else last", () => {
    expect(classifyClientGatewayTraceDivergence(["payload.value.disposition"], "the message it answers is missing from the trace").class).toBe("capture_gap");
    expect(classifyClientGatewayTraceDivergence(["payloadSchema.version", "payload.value.delivered"], undefined).class).toBe("capture_gap");
    expect(classifyClientGatewayTraceDivergence(["payload.value.id", "payload.value.timestamp"], undefined).class).toBe("nondeterminism");
    expect(classifyClientGatewayTraceDivergence(["payload.value.id", "payload.value.payload.actionType"], undefined).class).toBe("intake_defect");
  });
});

describe("reading differences", () => {
  it("names each differing path, and key order only when asked to", () => {
    expect(clientGatewayTraceJsonDifferences({ a: 1, b: [1, { c: null }] }, { a: 1, b: [1, { c: 0 }] }, "payload", true)).toEqual(["payload.b[1].c"]);
    expect(clientGatewayTraceJsonDifferences({ a: 1 }, { a: 1, b: 2 }, "", false)).toEqual(["b"]);
    expect(clientGatewayTraceJsonDifferences({ a: 1, b: 2 }, { b: 2, a: 1 }, "payload", true)).toEqual(["payload (key order)"]);
    expect(clientGatewayTraceJsonDifferences({ a: 1, b: 2 }, { b: 2, a: 1 }, "", false)).toEqual([]);
  });
});
