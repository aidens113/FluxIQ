import React from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { FieldHandlingControl } from "../FieldHandlingControl";

function buttonWithText(renderer: ReactTestRenderer, text: string): ReactTestInstance {
  const [button] = renderer.root.findAll((node) => node.type === "button" && node.props.children === text);
  if (!button) throw new Error("No button labelled " + text);
  return button;
}

describe("FieldHandlingControl", () => {
  it("writes the chosen handling and names the group and each option", async () => {
    const onChange = vi.fn();
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<FieldHandlingControl label="Field 2 handling" onChange={onChange} value="include" />);
    });
    expect(renderer.root.findByProps({ role: "group" }).props["aria-label"]).toBe("Field 2 handling");
    expect(buttonWithText(renderer, "Include").props["aria-pressed"]).toBe(true);
    expect(buttonWithText(renderer, "Exclude column").props["aria-pressed"]).toBe(false);
    await act(async () => buttonWithText(renderer, "Exclude column").props.onClick());
    expect(onChange).toHaveBeenLastCalledWith("exclude");
    await act(async () => buttonWithText(renderer, "Include").props.onClick());
    expect(onChange).toHaveBeenLastCalledWith("include");
    await act(async () => renderer.unmount());
  });

  it("keeps Encrypt column disabled with its reason until record keys exist", async () => {
    const onChange = vi.fn();
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<FieldHandlingControl label="Field 1 handling" onChange={onChange} value="include" />);
    });
    const encrypt = buttonWithText(renderer, "Encrypt column");
    expect(encrypt.props.disabled).toBe(true);
    expect(encrypt.props.title).toBe("Encrypt column arrives with project record keys");
    await act(async () => encrypt.props.onClick());
    expect(onChange).not.toHaveBeenCalled();
    const reason = renderer.root.findByProps({ "aria-label": "Why Encrypt column is unavailable" });
    const reasonTooltip = renderer.root.findByProps({ id: reason.props["aria-describedby"] });
    expect(reasonTooltip.props.children).toBe("Encrypt column arrives with project record keys");
    await act(async () => renderer.unmount());
  });

  it("carries the Exclude column hover", async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<FieldHandlingControl label="Field 1 handling" onChange={() => undefined} value="exclude" />);
    });
    const about = renderer.root.findByProps({ "aria-label": "About Exclude column" });
    const hover = renderer.root.findByProps({ id: about.props["aria-describedby"] });
    expect(hover.props.role).toBe("tooltip");
    expect(hover.props.children).toContain("leaves this column out entirely");
    expect(hover.props.children).toContain("passwords, card numbers, or personal details");
    expect(hover.props.children).toContain("does not propose it again");
    expect(buttonWithText(renderer, "Exclude column").props["aria-pressed"]).toBe(true);
    await act(async () => renderer.unmount());
  });
});
