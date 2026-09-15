import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import type { AutomationNodeParameter, AutomationStudioRecordOutput } from "fluxiq/automation-studio/nodes";
import { RecordOutputEditor } from "../RecordOutputEditor";

const parameter: AutomationNodeParameter = {
  id: "recordOutput",
  label: "Save extracted records",
  valueType: "json",
  defaultValue: null,
  allowStateBinding: false,
  ui: { control: "record-output" }
};

const stored: AutomationStudioRecordOutput = {
  datasetId: "products",
  label: "Products",
  recordsPath: "items",
  schema: {
    schemaVersion: "0.1",
    fields: [
      { id: "name", label: "Name", valueType: "string", required: true },
      { id: "email", label: "Email", valueType: "string", handling: "exclude" }
    ],
    primaryKey: ["name"]
  },
  writeMode: "append"
};

describe("RecordOutputEditor", () => {
  it("renders the table settings and the fields table, never the generic object editor", () => {
    const html = renderToStaticMarkup(<RecordOutputEditor onChange={() => undefined} parameter={parameter} value={stored} />);
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-label="Save extracted records"');
    for (const label of ["Table id", "Table name", "Records path", "Write mode", "Max records", "Field 1 name", "Field 2 id", "Field 2 handling"]) {
      expect(html).toContain(`aria-label="${label}"`);
    }
    expect(html).toContain("<legend>Fields</legend>");
    expect(html).toContain('value="products"');
    expect(html).toContain("earlier runs keep the columns they were saved with");
    expect(html).not.toContain('aria-label="Field value"');
    expect(html).not.toContain("Manual value");
    expect(html).not.toContain("State value");
  });

  it("shows Encrypt column disabled with its reason, and the Exclude column hover", async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<RecordOutputEditor onChange={() => undefined} parameter={parameter} value={stored} />);
    });
    const encryptButtons = renderer.root.findAll((node) => node.type === "button" && node.props.children === "Encrypt column");
    expect(encryptButtons).toHaveLength(2);
    expect(encryptButtons.every((button) => button.props.disabled === true)).toBe(true);
    const html = renderToStaticMarkup(<RecordOutputEditor onChange={() => undefined} parameter={parameter} value={stored} />);
    expect(html).toContain("Encrypt column arrives with project record keys");
    expect(html).toContain("passwords, card numbers, or personal details");
    await act(async () => renderer.unmount());
  });

  it("shows only the switch while saving is off, and the switch writes null or a new draft", async () => {
    const offHtml = renderToStaticMarkup(<RecordOutputEditor onChange={() => undefined} parameter={parameter} value={null} />);
    expect(offHtml).not.toContain('aria-label="Table id"');
    const onChange = vi.fn();
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<RecordOutputEditor onChange={onChange} parameter={parameter} value={stored} />);
    });
    const saveSwitch = renderer.root.findByProps({ role: "switch" });
    expect(saveSwitch.props.checked).toBe(true);
    await act(async () => saveSwitch.props.onChange({ target: { checked: false } }));
    expect(onChange).toHaveBeenLastCalledWith(null);
    await act(async () => renderer.update(<RecordOutputEditor onChange={onChange} parameter={parameter} value={null} />));
    await act(async () => renderer.root.findByProps({ role: "switch" }).props.onChange({ target: { checked: true } }));
    expect(onChange).toHaveBeenLastCalledWith({ datasetId: "", recordsPath: "", schema: { schemaVersion: "0.1", fields: [] }, writeMode: "append" });
    await act(async () => renderer.unmount());
  });

  it("writes table settings and added fields by name", async () => {
    const onChange = vi.fn();
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<RecordOutputEditor onChange={onChange} parameter={parameter} value={{ ...stored, maxRecords: 50 }} />);
    });
    await act(async () => renderer.root.findByProps({ "aria-label": "Table id" }).props.onChange({ target: { value: "orders" } }));
    expect(onChange.mock.lastCall?.[0]).toEqual({ ...stored, datasetId: "orders", maxRecords: 50 });
    await act(async () => renderer.root.findByProps({ "aria-label": "Max records" }).props.onChange({ target: { value: "" } }));
    expect(onChange.mock.lastCall?.[0]).not.toHaveProperty("maxRecords");
    expect(Object.keys(onChange.mock.lastCall?.[0]).sort()).toEqual(["datasetId", "label", "recordsPath", "schema", "writeMode"]);
    await act(async () => renderer.root.findByProps({ "aria-label": "Write mode" }).props.onChange({ target: { value: "replace" } }));
    expect(onChange.mock.lastCall?.[0].writeMode).toBe("replace");
    const addField = renderer.root.findAll((node) => node.type === "button" && node.props.className === "secondary-button compact")[0];
    await act(async () => addField?.props.onClick());
    expect(onChange.mock.lastCall?.[0].schema.fields[2]).toEqual({ id: "field_3", label: "Field 3", valueType: "string" });
    await act(async () => renderer.unmount());
  });
});
