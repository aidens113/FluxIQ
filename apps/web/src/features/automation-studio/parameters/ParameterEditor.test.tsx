import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AutomationNodeParameterEditor, automationParameterError } from "./ParameterEditor";

describe("automationParameterError", () => {
  it("validates required values and numeric constraints", () => {
    expect(automationParameterError({ id: "name", label: "Name", valueType: "string", required: true }, "")).toBe("Name is required.");
    const count = { id: "count", label: "Count", valueType: "number", constraints: { minimum: 1, maximum: 4, integer: true } } as const;
    expect(automationParameterError(count, 0)).toContain("1 or greater");
    expect(automationParameterError(count, 5)).toContain("4 or less");
    expect(automationParameterError(count, 2.5)).toContain("whole number");
    expect(automationParameterError(count, 2)).toBeNull();
  });

  it("validates formats and object references", () => {
    const identifier = { id: "key", label: "Key", valueType: "string", ui: { control: "identifier" as const }, constraints: { pattern: "^[a-z]" } } as const;
    expect(automationParameterError(identifier, "1 invalid")).toContain("required format");
    expect(automationParameterError(identifier, "valid-key")).toBeNull();
    const reference = { id: "target", label: "Target", valueType: "string", ui: { control: "reference" as const, referenceType: "routine" as const } } as const;
    const options = { routine: [{ id: "routine.one", label: "First routine" }] };
    expect(automationParameterError(reference, "missing", options)).toContain("available routine");
    expect(automationParameterError(reference, "routine.one", options)).toBeNull();
  });
});

describe("AutomationNodeParameterEditor reference picker", () => {
  it("renders friendly searchable options without exposing IDs", () => {
    const html = renderToStaticMarkup(
      <AutomationNodeParameterEditor
        node={{ parameters: [{ id: "routine", label: "Routine", valueType: "string", ui: { control: "reference", referenceType: "routine" } }], parameterValues: { routine: "routine.one" } }}
        referenceOptions={{ routine: [{ id: "routine.one", label: "First routine", detail: "Published" }] }}
        onChange={() => undefined}
        onDescriptionChange={() => undefined}
      />
    );
    expect(html).toContain('role="listbox"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain("aria-activedescendant=");
    expect(html).toContain('role="option"');
    expect(html).not.toMatch(/<button[^>]*role="option"/u);
    expect(html).toContain("Search Routine");
    expect(html).toContain("First routine");
    expect(html).toContain("Published");
    expect(html).not.toContain("routine.one");
    expect(html).not.toContain("Routine picker");
  });
});
