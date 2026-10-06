// The build's one instruction read: the lasting consequences the person asks
// for and the route they name, asked in one question and read independently,
// so a route Core cannot ground never costs the person a permission their
// words plainly gave, and a grounded permission never makes a route open.
import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_INSTRUCTED_CONSEQUENCES_SCHEMA, automationStudioInstructedActReads, automationStudioInstructedConsequencesSchema } from "../../instructed.ts";
import { automationStudioInstructionReadingSchema, readAutomationStudioInstructionReading } from "../index.ts";

const GOAL = {
  instructionId: "instruction.goal",
  title: "Accept friend requests",
  body: "On Chirply, go to the home page, open Friends, then Friend requests, and accept every request from someone in Leeds."
};
const ACCEPT = "accept every request from someone in Leeds";
const ROUTE = { kind: "named", instructionId: GOAL.instructionId, quote: "go to the home page, open Friends, then Friend requests", waypoints: ["the home page", "Friends", "Friend requests"] };
const ACTS = [{ id: "a1", quote: ACCEPT }];

type Schema = { required?: string[]; properties?: Record<string, { required?: string[]; properties?: Record<string, { enum?: string[] }> }> };

describe("the one question", () => {
  it("asks for the consequences and for the route together, the route required", () => {
    const schema = automationStudioInstructionReadingSchema(ACTS) as Schema;
    expect(schema.required).toEqual(["acts", "instructed", "route"]);
    expect(schema.properties?.acts).toEqual((automationStudioInstructedConsequencesSchema(ACTS) as Schema).properties?.acts);
    expect(schema.properties?.route?.required).toEqual(["kind"]);
    expect(schema.properties?.route?.properties?.kind?.enum).toEqual(["named", "open", "unclear"]);
  });

  it("asks the same with no acts read, and leaves the public consequence question as it was", () => {
    const schema = automationStudioInstructionReadingSchema([]) as Schema;
    expect(schema.required).toEqual(["instructed", "route"]);
    expect(AUTOMATION_STUDIO_INSTRUCTED_CONSEQUENCES_SCHEMA.required).toEqual(["instructed"]);
    expect(Object.keys(AUTOMATION_STUDIO_INSTRUCTED_CONSEQUENCES_SCHEMA.properties as object)).toEqual(["instructed"]);
  });

  it("says a Flow may start where the work begins only when the person names no route", () => {
    const route = (automationStudioInstructionReadingSchema([]) as { properties: { route: { description: string } } }).properties.route.description;
    expect(route).toMatch(/must be followed/iu);
    expect(route).toMatch(/start where the work begins/iu);
  });
});

describe("the answer, read two ways", () => {
  it("keeps grounded consequences when the route cannot be grounded", () => {
    const reading = readAutomationStudioInstructionReading({
      result: { acts: { a1: ["modify_existing"] }, instructed: [{ consequence: "modify_existing", quote: ACCEPT }], route: { ...ROUTE, quote: "go straight to Friend requests" } },
      instructions: [GOAL], acts: ACTS
    });
    expect(reading.route).toEqual({ state: "unavailable", reason: "ungrounded" });
    expect(reading.instructed.map((entry) => [entry.consequence, entry.quote])).toEqual([["modify_existing", ACCEPT]]);
    expect(automationStudioInstructedActReads(reading.instructed)).toEqual([{ act: "a1", quote: ACCEPT, consequences: ["modify_existing"] }]);
  });

  it("keeps grounded consequences when the answer has no route, which is not open", () => {
    const reading = readAutomationStudioInstructionReading({ result: { acts: { a1: ["modify_existing"] }, instructed: [] }, instructions: [GOAL], acts: ACTS });
    expect(reading.route).toEqual({ state: "unavailable", reason: "malformed" });
    expect(reading.instructed.map((entry) => entry.consequence)).toEqual(["modify_existing"]);
  });

  it("grounds a named route while the consequences claim nothing", () => {
    const reading = readAutomationStudioInstructionReading({ result: { acts: { a1: ["none"] }, instructed: [{ consequence: "delete", quote: "delete everything" }], route: ROUTE }, instructions: [GOAL], acts: ACTS });
    expect(reading.route.state).toBe("named");
    expect([...reading.instructed]).toEqual([]);
  });
});
