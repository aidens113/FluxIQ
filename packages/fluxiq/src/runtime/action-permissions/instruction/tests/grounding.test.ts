import { expect, it } from "vitest";
import { readAutomationStudioInstructedRead, currentAutomationStudioInstructedConsequences, automationStudioInstructedActReads, automationStudioMappedInstructionText, readAutomationStudioInstructionRoute, currentAutomationStudioInstructionRoute } from "../index.ts";

it("grounds per-act classes in actual instructions and lapses them when their original text changes", () => {
  const instruction = { instructionId: "instruction.actual", title: "Actual operation", body: "Archive the temporary copy." };
  const read = readAutomationStudioInstructedRead({ result: { instructed: [], acts: { a1: ["delete"] } }, instructions: [instruction], acts: [{ id: "a1", quote: instruction.body }] });
  expect(read).toMatchObject([{ consequence: "delete", instructionId: instruction.instructionId, quote: instruction.body }]);
  expect(automationStudioInstructedActReads(read)).toEqual([{ act: "a1", quote: instruction.body, consequences: ["delete"] }]);
  expect(JSON.stringify(read)).not.toContain('"acts"');
  expect(currentAutomationStudioInstructedConsequences({ stored: read, activeInstructions: [instruction] })).toEqual({ current: [...read], lapsed: [] });
  expect(currentAutomationStudioInstructedConsequences({ stored: read, activeInstructions: [{ ...instruction, body: "Keep the temporary copy." }] })).toEqual({ current: [], lapsed: [...read] });
});

it("preserves UTF-16 source spans and grounds unique route words without claiming they were visited", () => {
  const mapped = automationStudioMappedInstructionText("A  🚀\tB!")!;
  expect(mapped.text).toBe("a 🚀 b");
  expect(mapped.span(2, 4)).toEqual({ start: 3, end: 5 });
  expect(() => mapped.span(0, 0)).toThrow(RangeError);
  const instruction = { instructionId: "instruction.actual", title: "Sequence", body: "First enter Alpha; then enter Omega." };
  const route = readAutomationStudioInstructionRoute({ result: { route: { kind: "named", instructionId: instruction.instructionId, quote: instruction.body, waypoints: ["enter Alpha", "enter Omega"] } }, instructions: [instruction] });
  if (route.state !== "named") throw new Error("actual unique route not grounded");
  const text = `${instruction.title}\n${instruction.body}`;
  expect(route.waypoints.map(waypoint => text.slice(waypoint.sourceSpan.start, waypoint.sourceSpan.end))).toEqual(["enter Alpha", "enter Omega"]);
  expect(route.waypoints.map(waypoint => waypoint.order)).toEqual([1, 2]);
  expect(route).not.toHaveProperty("visited");
  expect(currentAutomationStudioInstructionRoute({ reading: route, activeInstructions: [{ ...instruction, body: "Enter Omega only." }] })).toMatchObject({ state: "unavailable", reason: "stale" });
  expect(readAutomationStudioInstructionRoute({ result: { route: { kind: "named", instructionId: instruction.instructionId, quote: "enter Alpha", waypoints: ["enter Alpha"] } }, instructions: [{ ...instruction, body: "enter Alpha then enter Alpha" }] })).toEqual({ state: "unavailable", reason: "ambiguous" });
});
