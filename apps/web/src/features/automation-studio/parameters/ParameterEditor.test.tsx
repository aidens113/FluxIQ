import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
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
  it("renders one parameter with interchangeable manual and state sources", () => {
    const html = renderToStaticMarkup(
      <AutomationNodeParameterEditor
        node={{
          parameters: [{ id: "message", label: "Message", valueType: "string" }],
          parameterValues: { message: { $state: { path: "app.currentMessage", fallback: "Manual message" } } }
        }}
        referenceOptions={{ state: [{ id: "app.currentMessage", label: "Current message", detail: "string" }] }}
        onChange={() => undefined}
        onDescriptionChange={() => undefined}
      />
    );

    expect(html).toContain("Message source");
    expect(html).toContain("Manual value");
    expect(html).toContain("State value");
    expect(html).toContain('value="app.currentMessage"');
    expect(html).toContain("last manual value remains the fallback");
  });

  it("preserves the manual value when switching to state and restores it when switching back", async () => {
    const onChange = vi.fn();
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <AutomationNodeParameterEditor
          node={{ parameters: [{ id: "message", label: "Message", valueType: "string" }], parameterValues: { message: "Manual message" } }}
          referenceOptions={{ state: [{ id: "app.currentMessage", label: "Current message" }] }}
          onChange={onChange}
          onDescriptionChange={() => undefined}
        />
      );
    });
    await act(async () => renderer.root.findByProps({ "aria-label": "Message source" }).props.onChange({ target: { value: "state" } }));
    expect(onChange).toHaveBeenLastCalledWith({ message: { $state: { path: "app.currentMessage", fallback: "Manual message" } } });
    await act(async () => renderer.update(
      <AutomationNodeParameterEditor
        node={{ parameters: [{ id: "message", label: "Message", valueType: "string" }], parameterValues: { message: { $state: { path: "app.currentMessage", fallback: "Manual message" } } } }}
        referenceOptions={{ state: [{ id: "app.currentMessage", label: "Current message" }] }}
        onChange={onChange}
        onDescriptionChange={() => undefined}
      />
    ));
    await act(async () => renderer.root.findByProps({ "aria-label": "Message source" }).props.onChange({ target: { value: "manual" } }));
    expect(onChange).toHaveBeenLastCalledWith({ message: "Manual message" });
    await act(async () => renderer.unmount());
  });

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
