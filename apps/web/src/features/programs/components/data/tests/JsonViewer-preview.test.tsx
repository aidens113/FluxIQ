import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { JsonViewer, CodeViewer } from "..";
import { InlineNotice } from "../../feedback";

let renderer: ReactTestRenderer | undefined;
beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(() => { if (renderer) act(() => renderer!.unmount()); renderer = undefined; vi.unstubAllGlobals(); });
function mount(value: unknown, defaultOpen = true) {
  act(() => { renderer = create(<JsonViewer label="Synthetic preview" value={value} defaultOpen={defaultOpen} />); });
  return renderer!.root;
}
it.each([1_999, 2_000])("preserves a %i-character string without truncation guidance", (length) => {
  const value = "x".repeat(length);
  const root = mount(value);
  expect(JSON.parse(root.findByType(CodeViewer).props.code)).toBe(value);
  expect(root.findAllByType(InlineNotice)).toHaveLength(0);
});
it.each(["root", "object", "array"])("reports a bounded long string in a %s preview", (shape) => {
  const value = "x".repeat(2_001);
  const root = mount(shape === "root" ? value : shape === "object" ? { value } : [value]);
  const parsed = JSON.parse(root.findByType(CodeViewer).props.code);
  const actual = shape === "root" ? parsed : shape === "object" ? parsed.value : parsed[0];
  expect(actual).toBe(`${"x".repeat(2_000)}...[truncated]`);
  expect(root.findByType(InlineNotice).props.message).toContain("This preview is bounded");
});
it("retains array and object bounds with their existing guidance", () => {
  let root = mount(Array.from({ length: 151 }, (_, index) => index));
  expect(JSON.parse(root.findByType(CodeViewer).props.code)).toHaveLength(151);
  expect(root.findByType(InlineNotice).props.message).toContain("This preview is bounded");
  act(() => renderer!.update(<JsonViewer label="Synthetic preview" value={Object.fromEntries(Array.from({ length: 151 }, (_, index) => [`k${index}`, index]))} defaultOpen />));
  root = renderer!.root;
  expect(JSON.parse(root.findByType(CodeViewer).props.code).__preview__).toBe("[Preview truncated: 1 more properties]");
  expect(root.findAllByType(InlineNotice)).toHaveLength(1);
});
it("does not traverse a collapsed preview", () => {
  const root = mount({ get value() { throw new Error("Collapsed preview traversed"); } }, false);
  expect(root.findAllByType(CodeViewer)).toHaveLength(0);
  expect(root.findAllByType(InlineNotice)).toHaveLength(0);
});
