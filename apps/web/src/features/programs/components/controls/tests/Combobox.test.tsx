import React from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Combobox, type ComboboxOption } from "../Combobox";

type Props = Parameters<typeof Combobox>[0];
let renderer: ReactTestRenderer | undefined;
let props: Props;
const options: ComboboxOption[] = [
  { value: "alpha", label: "Alpha", description: "First searchable description" },
  { value: "beta", label: "Beta" },
  { value: "gamma", label: "Gamma" },
];
const input = () => renderer!.root.findByType("input");
const choices = () => renderer!.root.findAll((node) => node.props.role === "option");
const label = (node: ReactTestInstance): string => node.children.map((child) => typeof child === "string" ? child : label(child)).join("");
const activeLabel = () => { const active = choices().find((node) => node.props.id === input().props["aria-activedescendant"]); return active ? label(active) : undefined; };
const press = (key: string) => { const preventDefault = vi.fn(); act(() => input().props.onKeyDown({ key, preventDefault })); return preventDefault; };
const mount = () => act(() => { renderer = create(<Combobox {...props} />); });
const update = (change: Partial<Props>) => act(() => { props = { ...props, ...change }; renderer!.update(<Combobox {...props} />); });
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  props = { label: "Choose target", options, value: "", onChange: vi.fn(), onQueryChange: vi.fn() };
});
afterEach(() => { if (renderer) act(() => renderer!.unmount()); renderer = undefined; vi.unstubAllGlobals(); });

describe("Combobox action ownership", () => {
  it("masks default-open choices while disabled", () => {
    props = { ...props, defaultOpen: true, disabled: true };
    mount();
    expect(input().props.disabled).toBe(true);
    expect(input().props["aria-expanded"]).toBe(false);
    expect(input().props["aria-activedescendant"]).toBeUndefined();
    expect(choices()).toHaveLength(0);
  });

  it("masks an open list and rejects all retained input/option actions when disabled", () => {
    props = { ...props, defaultOpen: true };
    mount();
    const choose = choices()[0]!.props.onClick;
    const old = input().props;
    update({ disabled: true });
    expect(choices()).toHaveLength(0);
    act(() => {
      choose(); old.onClick(); old.onChange({ target: { value: "Beta" } });
      old.onKeyDown({ key: "ArrowDown", preventDefault: vi.fn() });
      old.onKeyDown({ key: "Enter", preventDefault: vi.fn() });
    });
    expect(props.onChange).not.toHaveBeenCalled();
    expect(props.onQueryChange).not.toHaveBeenCalled();
    expect(input().props["aria-expanded"]).toBe(false);
    update({ disabled: false });
    expect(input().props["aria-expanded"]).toBe(false);
    act(() => input().props.onClick());
    act(() => choices()[1]!.props.onClick());
    expect(vi.mocked(props.onChange).mock.calls).toEqual([["beta"]]);
  });

  it("does not dispatch retained removed-option or replaced-option actions", () => {
    props = { ...props, defaultOpen: true };
    mount();
    const removed = choices()[0]!.props.onClick;
    const replaced = choices()[1]!.props.onClick;
    update({ options: [{ value: "beta", label: "Replacement Beta" }, options[2]!] });
    act(() => { removed(); replaced(); });
    expect(props.onChange).not.toHaveBeenCalled();
    act(() => choices()[0]!.props.onClick());
    expect(vi.mocked(props.onChange).mock.calls).toEqual([["beta"]]);
  });

  it("does not redirect a retained action into a replacement callback owner", () => {
    props = { ...props, defaultOpen: true };
    mount();
    const retired = choices()[0]!.props.onClick;
    const oldChange = props.onChange;
    const replacement = vi.fn();
    update({ onChange: replacement });
    act(() => retired());
    expect(oldChange).not.toHaveBeenCalled();
    expect(replacement).not.toHaveBeenCalled();
    act(() => choices()[0]!.props.onClick());
    expect(vi.mocked(replacement).mock.calls).toEqual([["alpha"]]);
  });

  it("does not revive first-owner callbacks after an A-B-A owner transition", () => {
    props = { ...props, defaultOpen: true };
    mount();
    const first = choices()[0]!.props.onClick;
    const ownerA = props.onChange;
    update({ onChange: vi.fn() });
    update({ onChange: ownerA });
    act(() => first());
    expect(ownerA).not.toHaveBeenCalled();
    const choose = choices()[0]!.props.onClick;
    act(() => { choose(); choose(); });
    expect(vi.mocked(ownerA).mock.calls).toEqual([["alpha"]]);
  });

  it("rejects obsolete blur and keyboard handlers after controlled selection replacement", () => {
    props = { ...props, defaultOpen: true, value: "alpha" };
    mount();
    const oldInput = input().props;
    const oldBlur = renderer!.root.findByProps({ className: "field combobox" }).props.onBlur;
    update({ value: "beta" });
    act(() => {
      oldBlur({ currentTarget: { contains: () => false }, relatedTarget: null });
      oldInput.onKeyDown({ key: "Enter", preventDefault: vi.fn() });
    });
    expect(props.onChange).not.toHaveBeenCalled();
    expect(input().props["aria-expanded"]).toBe(true);
    press("Escape");
    expect(input().props.value).toBe("Beta");
  });

  it("keeps current keyboard actions functional under strict lifecycle replay", () => {
    act(() => { renderer = create(<React.StrictMode><Combobox {...props} /></React.StrictMode>); });
    press("ArrowDown"); press("Enter");
    expect(vi.mocked(props.onChange).mock.calls).toEqual([["alpha"]]);
  });

  it("rejects retired query callbacks after replacement and unmount", () => {
    props = { ...props, defaultOpen: true };
    mount();
    const old = input().props;
    const choose = choices()[0]!.props.onClick;
    const firstQuery = props.onQueryChange;
    update({ onQueryChange: vi.fn() });
    act(() => old.onChange({ target: { value: "foreign query" } }));
    expect(firstQuery).not.toHaveBeenCalled();
    expect(props.onQueryChange).not.toHaveBeenCalled();
    const current = input().props;
    act(() => renderer!.unmount()); renderer = undefined;
    act(() => { choose(); current.onChange({ target: { value: "after unmount" } }); current.onClick(); current.onKeyDown({ key: "Enter", preventDefault: vi.fn() }); });
    expect(props.onChange).not.toHaveBeenCalled();
    expect(props.onQueryChange).not.toHaveBeenCalled();
  });

  it("keeps loading options selectable and preserves controlled selection", () => {
    props = { ...props, defaultOpen: true, loading: true };
    mount();
    act(() => choices()[1]!.props.onClick());
    expect(vi.mocked(props.onChange).mock.calls).toEqual([["beta"]]);
    update({ value: "beta" });
    expect(input().props.value).toBe("Beta");
    act(() => input().props.onClick());
    expect(choices()[0]!.props["aria-selected"]).toBe(true);
  });
});

describe("Combobox keyboard and query journeys", () => {
  it.each([
    ["native composition", { nativeEvent: { isComposing: true, keyCode: 13 } }],
    ["native legacy IME", { nativeEvent: { isComposing: false, keyCode: 229 } }],
    ["handled event", { defaultPrevented: true }],
    ["Ctrl shortcut", { ctrlKey: true }],
    ["Alt shortcut", { altKey: true }],
    ["Meta shortcut", { metaKey: true }],
    ["Shift shortcut", { shiftKey: true }],
  ])("preserves native input behavior for %s across selection/navigation/dismissal keys", (_name, guard) => {
    props = { ...props, defaultOpen: true };
    mount();
    const initialActive = input().props["aria-activedescendant"];
    for (const key of ["Enter", "ArrowDown", "ArrowUp", "Escape"]) {
      const preventDefault = vi.fn();
      act(() => input().props.onKeyDown({ key, nativeEvent: { isComposing: false, keyCode: 0 }, ...guard, preventDefault }));
      expect(preventDefault).not.toHaveBeenCalled();
      expect(props.onChange).not.toHaveBeenCalled();
      expect(props.onQueryChange).not.toHaveBeenCalled();
      expect(input().props["aria-expanded"]).toBe(true);
      expect(input().props["aria-activedescendant"]).toBe(initialActive);
      expect(input().props.value).toBe("");
    }
  });

  it("enters at the first option on first Down and moves/wraps only after opening", () => {
    mount();
    expect(input().props["aria-activedescendant"]).toBeUndefined();
    expect(press("ArrowDown")).toHaveBeenCalledOnce();
    expect(activeLabel()).toContain("Alpha");
    press("ArrowDown"); expect(activeLabel()).toBe("Beta");
    press("ArrowDown"); expect(activeLabel()).toBe("Gamma");
    press("ArrowDown"); expect(activeLabel()).toContain("Alpha");
    press("Enter"); expect(vi.mocked(props.onChange).mock.calls).toEqual([["alpha"]]);
    expect(input().props["aria-expanded"]).toBe(false);
  });

  it("enters at the last option on first Up and wraps backwards", () => {
    mount(); press("ArrowUp"); expect(activeLabel()).toBe("Gamma");
    press("ArrowUp"); expect(activeLabel()).toBe("Beta");
    press("ArrowUp"); expect(activeLabel()).toContain("Alpha");
    press("ArrowUp"); expect(activeLabel()).toBe("Gamma");
    press("Enter"); expect(vi.mocked(props.onChange).mock.calls).toEqual([["gamma"]]);
  });

  it("keeps empty Enter native and handles a single option without invalid descendants", () => {
    props = { ...props, options: [], loading: true };
    mount(); press("ArrowDown");
    expect(input().props["aria-activedescendant"]).toBeUndefined();
    expect(press("Enter")).not.toHaveBeenCalled();
    expect(props.onChange).not.toHaveBeenCalled();
    expect(renderer!.root.findByProps({ className: "combobox-empty" }).children).toEqual(["Loading options..."]);
    update({ options: [options[1]!], loading: false });
    press("ArrowDown"); press("ArrowUp"); expect(activeLabel()).toBe("Beta");
    press("Enter"); expect(vi.mocked(props.onChange).mock.calls).toEqual([["beta"]]);
  });

  it("searches descriptions and restores current selected text on Escape and external blur", () => {
    props = { ...props, value: "beta" };
    mount();
    act(() => input().props.onChange({ target: { value: "searchable" } }));
    expect(vi.mocked(props.onQueryChange!).mock.calls).toEqual([["searchable"]]);
    expect(choices()).toHaveLength(1);
    expect(activeLabel()).toContain("Alpha");
    press("Escape"); expect(input().props.value).toBe("Beta");
    expect(input().props["aria-expanded"]).toBe(false);
    act(() => input().props.onChange({ target: { value: "Gamma" } }));
    const wrapper = renderer!.root.findByProps({ className: "field combobox" });
    act(() => wrapper.props.onBlur({ currentTarget: { contains: () => false }, relatedTarget: null }));
    expect(input().props.value).toBe("Beta");
    expect(input().props["aria-expanded"]).toBe(false);
    expect(props.onChange).not.toHaveBeenCalled();
  });

  it("retains current choices on internal blur and prevents mouse focus loss", () => {
    props = { ...props, defaultOpen: true };
    mount();
    const wrapper = renderer!.root.findByProps({ className: "field combobox" });
    act(() => wrapper.props.onBlur({ currentTarget: { contains: () => true }, relatedTarget: {} }));
    expect(input().props["aria-expanded"]).toBe(true);
    const preventDefault = vi.fn(); act(() => choices()[0]!.props.onMouseDown({ preventDefault }));
    expect(preventDefault).toHaveBeenCalledOnce();
  });
});
