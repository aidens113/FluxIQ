import { describe, expect, it } from "vitest";
import type { TimelineEntry } from "../../../../model/index.ts";
import { createRecordingSession } from "../../../../model/index.ts";
import { RECORDING_STEPS_MAX, supportingAutomationRecordings, supportingRecordingSteps } from "../index.ts";

let sequence = 0;
function event(eventType: string, element: Record<string, unknown>): TimelineEntry {
  sequence += 1;
  return { id: `e${sequence}`, recordingId: "r", timestamp: sequence, monotonicOffsetMs: sequence, sequence, sourceId: "s", type: "domain_event", eventType, payload: { url: "https://shop.example/cart?session=SECRET123", element } } as TimelineEntry;
}
function action(actionType: string, fingerprint: Record<string, unknown>): TimelineEntry {
  sequence += 1;
  return { id: `a${sequence}`, recordingId: "r", timestamp: sequence, monotonicOffsetMs: sequence, sequence, sourceId: "s", type: "action", actionType, parameters: { text: "TYPED-SECRET" }, origin: "operator", startedAt: sequence, target: { type: "element", elementTarget: { kind: "element", fingerprint } } } as unknown as TimelineEntry;
}

describe("the steps a recording shows the build model", () => {
  it("keeps kind, label and role in order and drops values, addresses and page text", () => {
    const { steps, withheldSteps } = supportingRecordingSteps([
      event("web.element.clicked", { name: "  Add to   cart ", role: "button", visibleText: "Add to cart for $19.99 today", selector: "#a" }),
      event("web.element.input_changed", { name: "Quantity", role: "spinbutton", value: "7", inputValue: "7", visibleText: "7", text: "7" }),
      event("web.page.navigated", {}),
      event("web.element.focused", { name: "Quantity" }),
      event("web.dom.mutated", {})
    ]);
    expect(steps).toEqual([
      { kind: "clicked", label: "Add to cart", role: "button" },
      { kind: "input_changed", label: "Quantity", role: "spinbutton", valueEntered: true },
      { kind: "navigated" }
    ]);
    expect(withheldSteps).toBe(0);
    const text = JSON.stringify(steps);
    for (const leak of ["SECRET123", "shop.example", "$19.99", "\"7\""]) expect(text).not.toContain(leak);
  });

  it("omits password and payment steps entirely and counts them", () => {
    const { steps, withheldSteps } = supportingRecordingSteps([
      event("web.element.input_changed", { name: "Password", role: "textbox", attributes: { type: "password" } }),
      event("web.element.input_changed", { name: "Number", role: "textbox", attributes: { autocomplete: "cc-number" } }),
      event("web.element.input_changed", { name: "Card verification code", role: "textbox" }),
      event("web.element.clicked", { name: "Sign in", role: "button" })
    ]);
    expect(steps).toEqual([{ kind: "clicked", label: "Sign in", role: "button" }]);
    expect(withheldSteps).toBe(3);
  });

  it("labels an entering step by name alone and drops labels that look like addresses, emails or numbers", () => {
    const { steps } = supportingRecordingSteps([
      event("web.element.input_changed", { visibleText: "typed words", role: "textbox" }),
      event("web.element.clicked", { visibleText: "https://x.example/a?token=1", role: "link" }),
      event("web.element.clicked", { visibleText: "me@example.com", role: "link" }),
      event("web.element.clicked", { visibleText: "x".repeat(300), role: "link" })
    ]);
    expect(steps[0]).toEqual({ kind: "input_changed", role: "textbox", valueEntered: true });
    expect(steps[1]).toEqual({ kind: "clicked", role: "link" });
    expect(steps[2]).toEqual({ kind: "clicked", role: "link" });
    expect(steps[3]!.label!.length).toBeLessThanOrEqual(80);
  });

  it("marks a step a later one undid: a repeated toggle, a replaced entry, an explicit back", () => {
    const { steps } = supportingRecordingSteps([
      action("click", { accessibleName: "Gift wrap", role: "checkbox" }),
      action("click", { accessibleName: "Gift wrap", role: "checkbox" }),
      action("type", { accessibleName: "Search", role: "searchbox" }),
      action("type", { accessibleName: "Search", role: "searchbox" }),
      action("click", { accessibleName: "Next", role: "button" }),
      action("go_back", {})
    ]);
    expect(steps.map(step => [step.kind, step.undone ?? false, step.undoes ?? 0])).toEqual([
      ["click", true, 0], ["click", false, 1], ["type", true, 0], ["type", false, 0], ["click", true, 0], ["go_back", false, 5]
    ]);
    expect(JSON.stringify(steps)).not.toContain("TYPED-SECRET");
  });

  it("reads the labels where the web domain's recorded actions carry them: parameters.element, implicitRole", () => {
    sequence += 1;
    const recorded = (actionType: string, element: Record<string, unknown>): TimelineEntry => ({ id: `w${sequence += 1}`, recordingId: "r", timestamp: sequence, monotonicOffsetMs: sequence, sequence, sourceId: "s", type: "action", actionType, parameters: { selector: "#x", value: "TYPED-VALUE", element }, origin: "operator", startedAt: sequence }) as unknown as TimelineEntry;
    const { steps } = supportingRecordingSteps([
      recorded("web.dom.click", { tagName: "button", implicitRole: "button", accessibleName: "Remote", visibleText: "Remote 12 jobs" }),
      recorded("web.dom.select", { tagName: "select", implicitRole: "combobox", name: "sort", accessibleName: "Sort by", label: "Sort by", attributes: { name: "sort" } }),
      recorded("web.dom.scroll", {})
    ]);
    expect(steps).toEqual([
      { kind: "click", label: "Remote", role: "button" },
      { kind: "select", label: "Sort by", role: "combobox", valueEntered: true }
    ]);
    expect(JSON.stringify(steps)).not.toContain("TYPED-VALUE");
  });

  it("marks a picked item replaced from the same opener, and a different item between two picks of one", () => {
    const click = (label: string, role: string) => action("web.dom.click", { accessibleName: label, role });
    const { steps } = supportingRecordingSteps([
      click("Job type", "button"), click("Full-time", "link"),
      click("Job type", "button"), click("Any job type", "link"),
      click("date", "link"), click("relevance", "link"), click("Try again", "button"), click("date", "link")
    ]);
    expect(steps.map(step => [step.label, step.undone ?? false, step.undoes ?? 0])).toEqual([
      ["Job type", false, 0], ["Full-time", true, 0], ["Job type", false, 0], ["Any job type", false, 2],
      ["date", false, 0], ["relevance", true, 0], ["Try again", false, 0], ["date", false, 6]
    ]);
  });

  it("caps the list and says so", () => {
    const many = Array.from({ length: RECORDING_STEPS_MAX + 5 }, (_, index) => event("web.element.clicked", { name: `Item ${index}`, role: "button" }));
    const result = supportingRecordingSteps(many);
    expect(result.steps).toHaveLength(RECORDING_STEPS_MAX);
    expect(result.stepsTruncated).toBe(true);
  });

  it("rides in the supporting projection beside the description", async () => {
    const recording = createRecordingSession({ recordingId: "r", description: "Adds an item.", initialState: { timestamp: 1, namespaces: {} }, environment: { domainId: "web" }, metadata: { projectId: "p" } });
    recording.timeline.push(event("web.element.clicked", { name: "Add", role: "button" }));
    recording.endedAt = 9;
    const [projected] = await supportingAutomationRecordings("p", [{ linkedRecordingIds: ["r"] }], async () => recording);
    expect(projected).toMatchObject({ description: "Adds an item.", authority: "untrusted_supplementary_demonstration", steps: [{ kind: "clicked", label: "Add", role: "button" }], stepsTruncated: false, withheldSteps: 0 });
  });
});
