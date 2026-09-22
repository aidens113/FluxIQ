import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_COMPLETION_SCHEMA, AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT } from "../index.ts";

// What the model is told about the run its Flow will have. The only Flow the
// first end-to-end panel campaign created kept none of the dismissals its
// exploration needed, because nothing it was shown said the Flow would start
// again from the page as it first was. These rows hold the statement in the
// format, and in the completion schema that carries the format to the model,
// so a later rewrite of either cannot drop it unnoticed.

const REPLAY_PREMISE = "nothing you did while gathering evidence is still in effect then";

describe("the Flow script format's replay premise", () => {
  it("says the Flow runs without the model and without anything exploration changed", () => {
    expect(AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT).toContain("The Flow runs later on its own, with no model, from the page the run starts on");
    expect(AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT).toContain(REPLAY_PREMISE);
  });

  it("names a dismissal as a step the answer depends on, not as looking", () => {
    expect(AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT).toContain("every change the answer depended on is a step, in the order you made it, including closing a notice, prompt or banner that stood in front of a control");
  });

  it("reaches the model through the completion schema it answers", () => {
    expect(String(AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_COMPLETION_SCHEMA.description)).toContain(REPLAY_PREMISE);
  });
});
