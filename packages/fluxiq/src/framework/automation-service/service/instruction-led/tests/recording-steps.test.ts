import { describe, expect, it } from "vitest";
import type { TimelineEntry } from "../../../../../flows/authoring/model/index.ts";
import { createRecordingSession } from "../../../../../flows/authoring/model/index.ts";
import type { AutomationStudioRecordedStepReader, AutomationStudioRecordedStepReading } from "../../../nodes/index.ts";
import { RECORDING_STEPS_MAX, supportingAutomationRecordings, supportingRecordingSteps } from "../index.ts";

// Core's half: what it does with a domain's reading, and what it does with none.
// A real domain's reading of its own recorded entries is tested in that domain.

type Control = Partial<AutomationStudioRecordedStepReading> & { skip?: true };

let sequence = 0;
function step(eventType: string, control: Control): TimelineEntry {
  sequence += 1;
  return { id: `e${sequence}`, recordingId: "r", timestamp: sequence, monotonicOffsetMs: sequence, sequence, sourceId: "s", type: "domain_event", eventType, payload: { held: "HELD-VALUE", control } } as unknown as TimelineEntry;
}

/** A domain whose entries say what they are in so many words. */
const read: AutomationStudioRecordedStepReader = ({ entry }) => {
  const control = (entry as unknown as { payload: { control: Control } }).payload.control;
  if (control.skip) return null;
  return { secret: control.secret ?? false, identity: control.identity ?? [], label: control.label, role: control.role, entersValue: control.entersValue ?? false, undoes: control.undoes ?? false };
};

describe("the steps a recording shows the build model", () => {
  it("withholds every step and shows nothing with no domain reader", () => {
    const { steps, withheldSteps } = supportingRecordingSteps([
      step("acme.pressed", { label: "Add to cart", role: "button" }),
      step("acme.entered", { label: "Quantity", entersValue: true }),
      step("acme.noticed", { skip: true })
    ], undefined);
    expect(steps).toEqual([]);
    expect(withheldSteps).toBe(3);
  });

  it("keeps the kind Core normalized, the label and the role, and leaves out what the domain says is no step", () => {
    const seen: string[] = [];
    const { steps, withheldSteps } = supportingRecordingSteps([
      step("Acme.Thing.Pressed!", { label: "  Add to   cart ", role: "button" }),
      step("acme.entered", { label: "Quantity", role: "spinbutton", entersValue: true }),
      step("acme.noticed", { skip: true })
    ], (input) => {
      seen.push(input.kind);
      return read(input);
    });
    expect(seen).toEqual(["pressed_", "entered", "noticed"]);
    expect(steps).toEqual([
      { kind: "pressed_", label: "Add to cart", role: "button" },
      { kind: "entered", label: "Quantity", role: "spinbutton", valueEntered: true }
    ]);
    expect(withheldSteps).toBe(0);
    expect(JSON.stringify(steps)).not.toContain("HELD-VALUE");
  });

  it("withholds a step the domain calls secret, and one whose own words say so whatever the domain called it", () => {
    const { steps, withheldSteps } = supportingRecordingSteps([
      step("acme.entered", { secret: true, label: "Code", identity: ["Code"] }),
      step("acme.entered", { label: "Word", identity: ["Password"] }),
      step("acme.entered", { label: "Number", identity: ["cc-number"] }),
      step("acme.entered", { label: "Verify", identity: ["Card verification code"] }),
      step("acme.entered", { label: "Words", identity: ["one", "time"] }),
      step("acme.pressed", { label: "Sign in", role: "button", identity: ["Sign in"] })
    ], read);
    expect(steps).toEqual([{ kind: "pressed", label: "Sign in", role: "button" }]);
    expect(withheldSteps).toBe(5);
  });

  it("drops labels that read as addresses, emails or long numbers, and bounds the rest", () => {
    const { steps } = supportingRecordingSteps([
      step("acme.pressed", { label: "https://x.example/a?token=1", role: "link" }),
      step("acme.pressed", { label: "me@example.com", role: "link" }),
      step("acme.pressed", { label: "1234 5678 9012 3456", role: "link" }),
      step("acme.pressed", { label: "x".repeat(300), role: "link" })
    ], read);
    expect(steps[0]).toEqual({ kind: "pressed", role: "link" });
    expect(steps[1]).toEqual({ kind: "pressed", role: "link" });
    expect(steps[2]).toEqual({ kind: "pressed", role: "link" });
    expect(steps[3]!.label!.length).toBeLessThanOrEqual(80);
  });

  it("marks a step a later one undid: a repeated toggle, a replaced entry, an explicit back", () => {
    const { steps } = supportingRecordingSteps([
      step("acme.press", { label: "Gift wrap", role: "checkbox" }),
      step("acme.press", { label: "Gift wrap", role: "checkbox" }),
      step("acme.enter", { label: "Search", role: "searchbox", entersValue: true }),
      step("acme.enter", { label: "Search", role: "searchbox", entersValue: true }),
      step("acme.press", { label: "Next", role: "button" }),
      step("acme.back", { undoes: true })
    ], read);
    expect(steps.map(each => [each.kind, each.undone ?? false, each.undoes ?? 0])).toEqual([
      ["press", true, 0], ["press", false, 1], ["enter", true, 0], ["enter", false, 0], ["press", true, 0], ["back", false, 5]
    ]);
  });

  it("marks a picked item replaced from the same opener, and a different item between two picks of one", () => {
    const press = (label: string, role: string) => step("acme.press", { label, role });
    const { steps } = supportingRecordingSteps([
      press("Job type", "button"), press("Full-time", "link"),
      press("Job type", "button"), press("Any job type", "link"),
      press("date", "link"), press("relevance", "link"), press("Try again", "button"), press("date", "link")
    ], read);
    expect(steps.map(each => [each.label, each.undone ?? false, each.undoes ?? 0])).toEqual([
      ["Job type", false, 0], ["Full-time", true, 0], ["Job type", false, 0], ["Any job type", false, 2],
      ["date", false, 0], ["relevance", true, 0], ["Try again", false, 0], ["date", false, 6]
    ]);
  });

  it("caps the list and says so", () => {
    const many = Array.from({ length: RECORDING_STEPS_MAX + 5 }, (_, index) => step("acme.pressed", { label: `Item ${index}`, role: "button" }));
    const result = supportingRecordingSteps(many, read);
    expect(result.steps).toHaveLength(RECORDING_STEPS_MAX);
    expect(result.stepsTruncated).toBe(true);
  });

  it("rides in the supporting projection beside the description, read by the recording's own domain", async () => {
    const recording = createRecordingSession({ recordingId: "r", description: "Adds an item.", initialState: { timestamp: 1, namespaces: {} }, environment: { domainId: "acme" }, metadata: { projectId: "p" } });
    recording.timeline.push(step("acme.pressed", { label: "Add", role: "button" }));
    recording.endedAt = 9;
    const asked: string[] = [];
    const [projected] = await supportingAutomationRecordings("p", [{ linkedRecordingIds: ["r"] }], async () => recording, undefined, (domainId) => {
      asked.push(domainId);
      return read;
    });
    expect(asked).toEqual(["acme"]);
    expect(projected).toMatchObject({ description: "Adds an item.", authority: "untrusted_supplementary_demonstration", steps: [{ kind: "pressed", label: "Add", role: "button" }], stepsTruncated: false, withheldSteps: 0 });
  });

  it("withholds the projection's steps when the recording's domain has no reader, or the recording names no domain", async () => {
    const recording = createRecordingSession({ recordingId: "r", description: "Adds an item.", initialState: { timestamp: 1, namespaces: {} }, environment: { domainId: "acme" }, metadata: { projectId: "p" } });
    recording.timeline.push(step("acme.pressed", { label: "Add", role: "button" }));
    recording.endedAt = 9;
    const [noReader] = await supportingAutomationRecordings("p", [{ linkedRecordingIds: ["r"] }], async () => recording, undefined, () => undefined);
    expect(noReader).toMatchObject({ steps: [], withheldSteps: 1 });
    const [unbound] = await supportingAutomationRecordings("p", [{ linkedRecordingIds: ["r"] }], async () => recording);
    expect(unbound).toMatchObject({ steps: [], withheldSteps: 1 });
    recording.environment.domainId = null;
    const [noDomain] = await supportingAutomationRecordings("p", [{ linkedRecordingIds: ["r"] }], async () => recording, undefined, () => read);
    expect(noDomain).toMatchObject({ steps: [], withheldSteps: 1 });
  });
});
