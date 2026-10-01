// The composer: Enter sends, Shift+Enter starts a line, and the send button is
// one icon at a time.

import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { ConversationComposer } from "..";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function mount(props: Partial<React.ComponentProps<typeof ConversationComposer>> = {}) {
  const onSend = props.onSend ?? vi.fn(async () => true);
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<ConversationComposer busy={false} {...props} onSend={onSend} />);
  });
  return { renderer, onSend };
}

function box(renderer: ReactTestRenderer) {
  return renderer.root.findByProps({ "aria-label": "Message" });
}

function key(renderer: ReactTestRenderer, shiftKey: boolean) {
  const event = { key: "Enter", shiftKey, nativeEvent: { isComposing: false }, preventDefault: vi.fn() };
  box(renderer).props.onKeyDown(event);
  return event;
}

function sendButton(renderer: ReactTestRenderer) {
  return renderer.root.findByType("button");
}

describe("the composer", () => {
  it("sends the trimmed text on Enter and clears the box", async () => {
    const { renderer, onSend } = mount();
    act(() => box(renderer).props.onChange({ target: { value: "  Collect every product.  " } }));
    await act(async () => { key(renderer, false); });
    expect(onSend).toHaveBeenCalledWith("Collect every product.");
    expect(box(renderer).props.value).toBe("");
  });

  it("leaves Shift+Enter to start a new line", async () => {
    const { renderer, onSend } = mount();
    act(() => box(renderer).props.onChange({ target: { value: "First line" } }));
    let event!: ReturnType<typeof key>;
    await act(async () => { event = key(renderer, true); });
    expect(onSend).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  for (const scenario of ["edited", "retyped", "failed"] as const) {
    it(`keeps the appropriate draft after a pending send: ${scenario}`, async () => {
      let finish!: (sent: boolean) => void;
      const onSend = vi.fn(() => new Promise<boolean>((resolve) => { finish = resolve; }));
      const { renderer } = mount({ onSend });
      act(() => box(renderer).props.onChange({ target: { value: "Submitted" } }));
      act(() => { key(renderer, false); });
      act(() => { renderer.update(<ConversationComposer busy onSend={onSend} />); });
      expect(box(renderer).props.disabled).not.toBe(true);
      if (scenario === "edited") act(() => box(renderer).props.onChange({ target: { value: "Newer words" } }));
      if (scenario === "retyped") {
        act(() => box(renderer).props.onChange({ target: { value: "Changed" } }));
        act(() => box(renderer).props.onChange({ target: { value: "Submitted" } }));
      }
      await act(async () => { finish(scenario !== "failed"); });
      expect(box(renderer).props.value).toBe(scenario === "edited" ? "Newer words" : "Submitted");
      expect(onSend).toHaveBeenCalledTimes(1);
      expect(onSend).toHaveBeenCalledWith("Submitted");
      act(() => renderer.unmount());
    });
  }

  it("does not send when Enter confirms an input-method composition", () => {
    const { renderer, onSend } = mount();
    act(() => box(renderer).props.onChange({ target: { value: "Composed text" } }));
    const event = { key: "Enter", shiftKey: false, nativeEvent: { isComposing: true }, preventDefault: vi.fn() };
    act(() => box(renderer).props.onKeyDown(event));
    expect(onSend).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(box(renderer).props.value).toBe("Composed text");
    act(() => renderer.unmount());
  });

  it("starts as one line and grows by measurement, not a row count", () => {
    const { renderer } = mount();
    expect(box(renderer).props.rows).toBe(1);
  });

  it("offers no send until there is something to send", () => {
    const { renderer } = mount();
    expect(sendButton(renderer).props.disabled).toBe(true);
    act(() => box(renderer).props.onChange({ target: { value: "Go" } }));
    expect(sendButton(renderer).props.disabled).toBe(false);
  });

  it("shows the arrow, or the spinner while sending, never both", () => {
    const idle = mount().renderer;
    expect(sendButton(idle).findAllByType("svg")).toHaveLength(1);
    expect(sendButton(idle).props["aria-busy"]).toBeUndefined();
    const busy = mount({ busy: true }).renderer;
    expect(sendButton(busy).findAllByType("svg")).toHaveLength(1);
    expect(sendButton(busy).props["aria-busy"]).toBe(true);
    expect(sendButton(busy).props.disabled).toBe(true);
  });

  it("names the button for a screen reader and says the keys on hover", () => {
    const { renderer } = mount();
    const button = sendButton(renderer);
    expect(button.findByProps({ className: "automation-conversation-sr" }).children).toEqual(["Send"]);
    expect(button.props.title).toContain("Shift and Enter");
  });
});
