import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vitest";
import { ProductionParameterFields } from "../ProductionParameterFields";
import { prepareProductionParameters } from "../prepareProductionParameters";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let renderer: ReactTestRenderer | undefined;
afterEach(() => { if (renderer) act(() => renderer!.unmount()); renderer = undefined; });
const schema = (field: unknown, extra = {}) => ({ properties: { choice: field }, ...extra });
it("uses control-only option indices and distinguishes empty selection from absence", () => {
  const onChange = vi.fn(); const declaration = schema({ enum: ["", "a"] });
  act(() => { renderer = create(<ProductionParameterFields schema={declaration} values={{}} onChange={onChange} />); });
  expect(renderer!.root.findByType("select").props.value).toBe("unset");
  act(() => renderer!.root.findByType("select").props.onChange({ target: { value: "option:0" } }));
  expect(onChange).toHaveBeenLastCalledWith({ choice: "" });
  expect(prepareProductionParameters(declaration, onChange.mock.calls[0]![0]).metadata).toEqual({ choice: "" });
  act(() => renderer!.update(<ProductionParameterFields schema={declaration} values={{ choice: "" }} onChange={onChange} />));
  expect(renderer!.root.findByType("select").props.value).toBe("option:0");
  act(() => renderer!.root.findByType("select").props.onChange({ target: { value: "unset" } }));
  expect(onChange).toHaveBeenLastCalledWith({});
});
it("preserves actual enum values and control identity when choices reorder", () => {
  const onChange = vi.fn();
  act(() => { renderer = create(<ProductionParameterFields schema={schema({ type: "number", enum: [1, 2] })} values={{ choice: "2" }} onChange={onChange} />); });
  const control = renderer!.root.findByType("select"); const oldHandler = control.props.onChange;
  expect(control.props.value).toBe("option:1");
  act(() => renderer!.update(<ProductionParameterFields schema={schema({ type: "number", enum: [2, 1] })} values={{ choice: "2" }} onChange={onChange} />));
  expect(renderer!.root.findByType("select")).toBe(control); expect(control.props.value).toBe("option:0");
  act(() => oldHandler({ target: { value: "option:0" } })); expect(onChange).not.toHaveBeenCalled();
  act(() => control.props.onChange({ target: { value: "option:1" } })); expect(onChange).toHaveBeenLastCalledWith({ choice: "1" });
});
it("restores untouched enum defaults without emitting a sentinel", () => {
  const onChange = vi.fn(); const declaration = schema({ enum: ["a", "b"], default: "b" });
  act(() => { renderer = create(<ProductionParameterFields schema={declaration} values={{ choice: "a" }} onChange={onChange} />); });
  act(() => renderer!.root.findByType("select").props.onChange({ target: { value: "unset" } }));
  expect(prepareProductionParameters(declaration, onChange.mock.calls[0]![0]).metadata).toEqual({ choice: "b" });
});
it("labels required controls and links fixed errors accessibly", () => {
  act(() => { renderer = create(<ProductionParameterFields schema={schema({ title: "Amount", type: "number" }, { required: ["choice"] })} values={{ choice: "bad" }} onChange={() => {}} />); });
  const control = renderer!.root.findByType("input"), label = renderer!.root.findByType("label"), error = renderer!.root.findByProps({ role: "alert" });
  expect(control.props.required).toBe(true); expect(control.props["aria-invalid"]).toBe(true);
  expect(label.props.htmlFor).toBe(control.props.id); expect(control.props["aria-describedby"]).toBe(error.props.id);
  expect(error.children.join("")).toBe("Enter a finite number.");
});
it("retains invalid removed enum drafts, and fences handlers after unmount", () => {
  const onChange = vi.fn();
  act(() => { renderer = create(<ProductionParameterFields schema={schema({ enum: ["a"] })} values={{ choice: "b" }} onChange={onChange} />); });
  const control = renderer!.root.findByType("select"); expect(control.props.value).toBe("unset");
  expect(renderer!.root.findByProps({ role: "alert" }).children.join("")).toBe("Choose a declared option.");
  const handler = control.props.onChange; act(() => renderer!.unmount()); renderer = undefined;
  act(() => handler({ target: { value: "option:0" } })); expect(onChange).not.toHaveBeenCalled();
});
