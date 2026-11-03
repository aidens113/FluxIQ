// Draws one of the panel's lucide icons (`./lucide-nodes.ts`) as an inline
// SVG, the way lucide draws it: a 24 by 24 view box, no fill, stroked in the
// current colour at width 2 with round caps and joins. The icon is
// decoration: hidden from assistive technology and never focusable, so the
// words beside it carry the meaning. A name the panel has no icon for draws
// `circle-dot`, the generic action.

import { LUCIDE_ICON_NODES } from "./lucide-nodes.ts";

const SVG = "http://www.w3.org/2000/svg";
const FALLBACK = "circle-dot";

/** The icon `name` (a lucide name, kebab case) at `size` pixels. */
export function lucideIcon(name: string, size = 16): SVGSVGElement {
  const known = Object.hasOwn(LUCIDE_ICON_NODES, name);
  const nodes = LUCIDE_ICON_NODES[known ? name : FALLBACK] ?? [];
  const svg = document.createElementNS(SVG, "svg");
  const attrs: Readonly<Record<string, string>> = {
    viewBox: "0 0 24 24",
    width: String(size),
    height: String(size),
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
    focusable: "false",
    "data-icon": known ? name : FALLBACK
  };
  for (const [attr, value] of Object.entries(attrs)) svg.setAttribute(attr, value);
  for (const [tag, shape] of nodes) {
    const node = document.createElementNS(SVG, tag);
    for (const [attr, value] of Object.entries(shape)) node.setAttribute(attr, value);
    svg.append(node);
  }
  return svg;
}
