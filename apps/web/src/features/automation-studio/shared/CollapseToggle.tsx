"use client";

// One control for one verb.
//
// Four regions could be collapsed -- the hierarchy sidebar, the details panel,
// the step-preview dock and the conversation -- and each had written its own
// chevron, with its own icon pair, its own class and its own wording
// ("Collapse sidebar", "Collapse right area", "Collapse timeline", "Collapse the
// conversation"). A person learning the panel had to learn the same affordance
// four times and could not tell from the button whether it did the same thing.
//
// The rule the icon follows is the only one that reads without being taught:
// **the chevron points the way the panel is about to move.** A panel on the
// left edge collapses leftward and reopens rightward; one on the right edge is
// the mirror of that; one along the bottom collapses downward. The caller says
// which edge it is on and what it is called, and nothing else about a collapse
// is decided per region.

import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";

/** Which edge of the workspace the panel is attached to, which is what decides the chevron. */
export type AutomationCollapseEdge = "left" | "right" | "bottom";

export function AutomationCollapseToggle(props: {
  /** The id of the region this collapses, for `aria-controls`. */
  controls: string;
  collapsed: boolean;
  edge: AutomationCollapseEdge;
  /** Extra classes for a region that positions its own chrome. The shared class is always applied. */
  className?: string;
  size?: number;
  /** What is being collapsed, in the person's words: "sidebar", "details panel", "step preview". */
  subject: string;
  /** Appended to the title only, for a region that also answers a key -- "Esc", say. */
  shortcut?: string;
  onToggle(): void;
}) {
  const label = automationCollapseToggleLabel(props.collapsed, props.subject);
  const Icon = automationCollapseToggleIcon(props.collapsed, props.edge);
  return (
    <button
      aria-controls={props.controls}
      aria-expanded={!props.collapsed}
      aria-label={label}
      className={["icon-button", "automation-collapse-toggle", props.className].filter(Boolean).join(" ")}
      onClick={props.onToggle}
      title={props.shortcut ? `${label} (${props.shortcut})` : label}
      type="button"
    >
      <Icon aria-hidden size={props.size ?? 14} />
    </button>
  );
}

/** Show or hide, always in those words, whichever region is asking. */
export function automationCollapseToggleLabel(collapsed: boolean, subject: string): string {
  return collapsed ? `Show the ${subject}` : `Hide the ${subject}`;
}

/** The chevron points the way the panel is about to move. */
export function automationCollapseToggleIcon(collapsed: boolean, edge: AutomationCollapseEdge) {
  if (edge === "bottom") return collapsed ? ChevronUp : ChevronDown;
  if (edge === "right") return collapsed ? ChevronLeft : ChevronRight;
  return collapsed ? ChevronRight : ChevronLeft;
}
