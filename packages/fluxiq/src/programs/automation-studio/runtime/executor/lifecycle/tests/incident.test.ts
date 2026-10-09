import { describe, expect, it } from "vitest";
import { automationStudioHandlerOccurrenceKey } from "../incident.ts";

const occurrence = { handlerId: "g/h-1", nodeArrival: { invocationId: "inv-2", nodeId: "press", arrival: 1 }, conditionEvidence: { dialog: "open", count: 2 } };

describe("handler occurrence keys", () => {
  it("is handler id + node arrival + evidence digest, stable across key order", () => {
    const key = automationStudioHandlerOccurrenceKey(occurrence);
    expect(key).toMatch(/^g\/h-1@inv-2\/press#1:[0-9a-f]{16}$/);
    expect(automationStudioHandlerOccurrenceKey({ ...occurrence, conditionEvidence: { count: 2, dialog: "open" } })).toBe(key);
  });

  it("differs for another arrival, other evidence or another handler", () => {
    const key = automationStudioHandlerOccurrenceKey(occurrence);
    expect(automationStudioHandlerOccurrenceKey({ ...occurrence, nodeArrival: { ...occurrence.nodeArrival, arrival: 2 } })).not.toBe(key);
    expect(automationStudioHandlerOccurrenceKey({ ...occurrence, conditionEvidence: { dialog: "closed", count: 2 } })).not.toBe(key);
    expect(automationStudioHandlerOccurrenceKey({ ...occurrence, handlerId: "g/h-2" })).not.toBe(key);
  });
});
