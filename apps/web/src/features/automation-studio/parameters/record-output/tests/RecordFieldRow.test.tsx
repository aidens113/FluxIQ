import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioRecordOutput } from "fluxiq/automation-studio/nodes";
import { RecordFieldRow } from "../RecordFieldRow";

const output: AutomationStudioRecordOutput = {
  datasetId: "products",
  recordsPath: "items",
  schema: {
    schemaVersion: "0.1",
    fields: [
      { id: "name", label: "Name", valueType: "string" },
      { id: "email", label: "Email", valueType: "string", handling: "exclude" }
    ],
    primaryKey: ["name"]
  },
  writeMode: "append"
};

async function renderRow(index: number, onChange: (next: AutomationStudioRecordOutput) => void): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<RecordFieldRow index={index} onChange={onChange} output={output} />);
  });
  return renderer;
}

describe("RecordFieldRow", () => {
  it("moves a field and bounds the move buttons at the ends", async () => {
    const onChange = vi.fn();
    const first = await renderRow(0, onChange);
    expect(first.root.findByProps({ "aria-label": "Move field 1 up" }).props.disabled).toBe(true);
    expect(first.root.findByProps({ "aria-label": "Move field 1 down" }).props.disabled).toBe(false);
    await act(async () => first.root.findByProps({ "aria-label": "Move field 1 down" }).props.onClick());
    expect(onChange.mock.lastCall?.[0].schema.fields.map((field: { id: string }) => field.id)).toEqual(["email", "name"]);
    await act(async () => first.unmount());
    const last = await renderRow(1, onChange);
    expect(last.root.findByProps({ "aria-label": "Move field 2 down" }).props.disabled).toBe(true);
    await act(async () => last.unmount());
  });

  it("renames with a derived id, keeps the key, and removes a field", async () => {
    const onChange = vi.fn();
    const row = await renderRow(0, onChange);
    await act(async () => row.root.findByProps({ "aria-label": "Field 1 name" }).props.onChange({ target: { value: "Product" } }));
    expect(onChange.mock.lastCall?.[0].schema.fields[0]).toEqual({ id: "product", label: "Product", valueType: "string" });
    expect(onChange.mock.lastCall?.[0].schema.primaryKey).toEqual(["product"]);
    await act(async () => row.root.findByProps({ "aria-label": "Field 1 value type" }).props.onChange({ target: { value: "url" } }));
    expect(onChange.mock.lastCall?.[0].schema.fields[0].valueType).toBe("url");
    await act(async () => row.root.findByProps({ "aria-label": "Remove field 1" }).props.onClick());
    expect(onChange.mock.lastCall?.[0].schema.fields).toEqual([{ id: "email", label: "Email", valueType: "string", handling: "exclude" }]);
    expect(onChange.mock.lastCall?.[0].schema.primaryKey).toBeUndefined();
    await act(async () => row.unmount());
  });

  it("offers the key only for an included column", async () => {
    const onChange = vi.fn();
    const included = await renderRow(0, onChange);
    expect(included.root.findByProps({ "aria-label": "Field 1 is the key" }).props.checked).toBe(true);
    await act(async () => included.unmount());
    const excluded = await renderRow(1, onChange);
    const key = excluded.root.findByProps({ "aria-label": "Field 2 is the key" });
    expect(key.props.disabled).toBe(true);
    expect(excluded.root.findByProps({ role: "group" }).props["aria-label"]).toBe("Field 2 handling");
    await act(async () => excluded.unmount());
  });
});
