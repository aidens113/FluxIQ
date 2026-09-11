"use client";

import { cloneElement, isValidElement, useId, type ReactNode } from "react";

type TooltipChildProps = { "aria-describedby"?: string };

export function Tooltip(props: { content: string; children: ReactNode }) {
  const tooltipId = `tooltip-${useId().replace(/:/g, "")}`;
  const child = isValidElement<TooltipChildProps>(props.children)
    ? cloneElement(props.children, {
      "aria-describedby": [props.children.props["aria-describedby"], tooltipId].filter(Boolean).join(" ")
    })
    : props.children;
  return <span className="tooltip-anchor">{child}<span className="tooltip-content" id={tooltipId} role="tooltip">{props.content}</span></span>;
}
