import { describe, expect, it, vi } from "vitest";
import type { RecordingDomainDefinition, StateValue } from "../../../../../flows/authoring/model/index.ts";
import type { NormalizedTimeline } from "../../../../../runtime/recording/normalization/index.ts";
import type { AutomationStudioStateElementKindReader } from "../../../nodes/index.ts";
import { createStateActionCorrelations, descriptorForStateValue, inferStateElementKind, stateElementKindReaderForTimeline, stateElementPriority } from "../index.ts";

const value = (type: StateValue["type"]): StateValue => ({ value: "x", type } as unknown as StateValue);

describe("what a state path is, in Core's neutral words", () => {
  it.each([
    ["account.id", "string", "static_id"],
    ["accountId", "string", "static_id"],
    ["internal.counter", "number", "internal_id"],
    ["field.label", "string", "label"],
    ["page.title", "string", "text"],
    ["order.status", "string", "status"],
    ["app.route", "string", "route"],
    ["page.url", "string", "url"],
    ["panel.visible", "boolean", "visibility"],
    ["save.enabled", "boolean", "enabled"],
    ["cart.quantity", "number", "count"],
    ["anything", "point", "position"],
    ["anything", "rectangle", "bounds"],
    ["anything", "entity_ref", "internal_id"],
    ["anything", "json", "json"],
    ["anything", "string", "text"],
    ["anything", "number", "count"],
    ["anything", "boolean", "visibility"]
  ] as const)("reads %s as %s to %s", (path, type, kind) => {
    expect(inferStateElementKind(path, type)).toBe(kind);
  });

  it("knows no one domain's word for an address: with no reader it is ordinary text", () => {
    expect(inferStateElementKind("element.selector", "string")).toBe("text");
  });
});

describe("a domain's own words for a state path", () => {
  const read: AutomationStudioStateElementKindReader = (path) => path.includes("locatorish") ? "selector" : undefined;

  it("are asked first, and leave the rest to Core's", () => {
    expect(inferStateElementKind("field.label.locatorish", "string", read)).toBe("selector");
    expect(inferStateElementKind("field.label", "string", read)).toBe("label");
  });

  it("rank what they name, and reach a descriptor no domain declared", () => {
    const descriptors = new Map();
    expect(descriptorForStateValue("ns.field.locatorish", value("string"), descriptors, read).kind).toBe("selector");
    expect(stateElementPriority("ns.field.locatorish", value("string"), descriptors, read)).toBeGreaterThan(stateElementPriority("ns.field.locatorish", value("string"), descriptors));
  });

  it("come from the timeline's own domain, or any domain when it names none", () => {
    const domains = [{ domainId: "a" }, { domainId: "b" }] as unknown as RecordingDomainDefinition[];
    const readerOf = vi.fn((domainId: string) => domainId === "b" ? read : undefined);
    const named = { metadata: { domainId: "b" }, timeline: [] } as unknown as NormalizedTimeline;
    const unnamed = { timeline: [] } as unknown as NormalizedTimeline;
    const other = { metadata: { domainId: "a" }, timeline: [] } as unknown as NormalizedTimeline;
    expect(stateElementKindReaderForTimeline(named, domains, readerOf)).toBe(read);
    expect(stateElementKindReaderForTimeline(unnamed, domains, readerOf)).toBe(read);
    expect(stateElementKindReaderForTimeline(other, domains, readerOf)).toBeUndefined();
  });

  it("reach what mining correlates with an action, and without a reader the path is still kept, as text", () => {
    const action = { id: "a1", type: "action", monotonicOffsetMs: 10 };
    const checkpoint = { id: "c1", type: "state_checkpoint", monotonicOffsetMs: 5, state: { namespaces: { ns: { values: { "field.locatorish": { value: "#save", type: "string" } } } } } };
    const timeline = { recordingId: "r", normalizedTimelineId: "n", timeline: [checkpoint, action] } as unknown as NormalizedTimeline;
    const actions = [action] as unknown as NormalizedTimeline["timeline"];
    const kinds = (readKind?: AutomationStudioStateElementKindReader) => createStateActionCorrelations("m", timeline, actions, new Map(), readKind).map((correlation) => [correlation.statePath, correlation.elementKind]);
    expect(kinds(read)).toEqual([["ns.field.locatorish", "selector"]]);
    expect(kinds()).toEqual([["ns.field.locatorish", "text"]]);
  });
});
