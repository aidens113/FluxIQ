"use client";

import { cloneElement, isValidElement, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";

type TooltipChildProps = { "aria-describedby"?: string };

export function Tooltip(props: { content: string; children: ReactNode }) {
  const tooltipId = `tooltip-${useId().replace(/:/g, "")}`;
  const anchor = useRef<HTMLSpanElement>(null);
  const mounted = useRef(false);
  const interaction = useRef({ hovered: false, focused: false, dismissed: false });
  const [state, setState] = useState(interaction.current);
  const open = (state.hovered || state.focused) && !state.dismissed;
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  function owns(target: EventTarget | null) {
    try { return Boolean(target && anchor.current?.contains(target as Node)); } catch { return false; }
  }
  function current(currentTarget: HTMLSpanElement, target: EventTarget | null) {
    return mounted.current && currentTarget === anchor.current && anchor.current.isConnected !== false && owns(target);
  }
  function update(change: Partial<typeof state>) {
    const next = { ...interaction.current, ...change };
    if (!next.hovered && !next.focused) next.dismissed = false;
    interaction.current = next; setState(next);
  }
  useEffect(() => {
    const node = anchor.current;
    if (!open || !node) return;
    const document = node.ownerDocument;
    let active = true;
    const dismiss = (event: KeyboardEvent) => {
      if (!active || !mounted.current || anchor.current !== node || node.isConnected === false || node.ownerDocument !== document || document.visibilityState !== "visible" || (typeof document.hasFocus === "function" && !document.hasFocus())) return;
      const value = interaction.current;
      if (value.dismissed || (!value.hovered && !value.focused) || event.key !== "Escape" || event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
      update({ dismissed: true });
    };
    document.addEventListener("keydown", dismiss);
    return () => { active = false; document.removeEventListener("keydown", dismiss); };
  }, [open]);
  const child = isValidElement<TooltipChildProps>(props.children)
    ? cloneElement(props.children, {
      "aria-describedby": [props.children.props["aria-describedby"], tooltipId].filter(Boolean).join(" ")
    })
    : props.children;
  return <span className="tooltip-anchor" data-open={open} ref={anchor}
    onPointerEnter={(event) => { if (current(event.currentTarget, event.target) && (event.pointerType === "mouse" || event.pointerType === "pen")) update({ hovered: true }); }}
    onPointerLeave={(event) => { if (current(event.currentTarget, event.target) && !owns(event.relatedTarget)) update({ hovered: false }); }}
    onFocus={(event) => { if (current(event.currentTarget, event.target)) update({ focused: true }); }}
    onBlur={(event) => { if (current(event.currentTarget, event.target) && !owns(event.relatedTarget)) update({ focused: false }); }}
  >{child}<span className="tooltip-content" id={tooltipId} role="tooltip">{props.content}</span></span>;
}
