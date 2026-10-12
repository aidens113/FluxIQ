// Where the Handlers area sits on the canvas: apart from the main path, so the
// canvas still reads as the normal procedure.
//
// A Handler is a registration no route enters, so a layout by depth (Core's
// `flow-bootstrap/plan/layout.ts`, the editor's own `layoutAutomationFlowNodes`)
// puts it, and its body, in the first columns among the main path's steps.
// When a loaded graph's handlers overlap its main path, they are moved into a
// band below it, one Handler per row with its body to its right. A graph whose
// handlers are already clear of the main path keeps the positions it has: the
// person may have arranged them.

import type { Node } from "@xyflow/react";
import { AUTOMATION_FLOW_NODE_HEIGHT, AUTOMATION_FLOW_NODE_WIDTH } from "../../flow-editor/node-types";

/** Space between the main path and the Handlers area, and between cards in it. */
const AREA_GAP = 220;
const COLUMN_GAP = 80;
const ROW_GAP = 80;
/** Room inside the area's outline around its cards, and above them for its heading. */
const AREA_PADDING = 40;
const AREA_HEADING = 56;

type Rect = { x: number; y: number; width: number; height: number };

/**
 * The nodes with every Handler and its body moved below the main path when
 * the two overlap; the same array when they do not, or when either is empty.
 * `bodies` is each Handler's body steps in the order its body reaches them.
 */
export function separateFlowHandlerArea<Data extends Record<string, unknown>>(
  nodes: Array<Node<Data>>,
  bodies: ReadonlyMap<string, readonly string[]>
): Array<Node<Data>> {
  const area = new Set<string>();
  for (const [handlerId, steps] of bodies) {
    area.add(handlerId);
    for (const step of steps) area.add(step);
  }
  const main = nodes.filter((node) => !area.has(node.id));
  const handlers = nodes.filter((node) => area.has(node.id));
  if (!main.length || !handlers.length) return nodes;
  const mainBounds = boundsOf(main)!;
  const areaBounds = boundsOf(handlers)!;
  if (!overlaps(expand(mainBounds, AREA_GAP / 2), areaBounds)) return nodes;
  const positions = new Map<string, { x: number; y: number }>();
  const top = mainBounds.y + mainBounds.height + AREA_GAP + AREA_HEADING;
  let row = 0;
  for (const [handlerId, steps] of bodies) {
    const y = top + row * (AUTOMATION_FLOW_NODE_HEIGHT + ROW_GAP);
    [handlerId, ...steps].forEach((nodeId, column) => {
      if (!positions.has(nodeId)) positions.set(nodeId, { x: mainBounds.x + column * (AUTOMATION_FLOW_NODE_WIDTH + COLUMN_GAP), y });
    });
    row += 1;
  }
  return nodes.map((node) => {
    const position = positions.get(node.id);
    return position ? { ...node, position } : node;
  });
}

/** The Handlers area's outline in flow coordinates, around every node in it, or nothing when it is empty. */
export function flowHandlerAreaBounds(nodes: ReadonlyArray<Node<any>>, areaNodeIds: ReadonlySet<string>): Rect | null {
  const inArea = nodes.filter((node) => areaNodeIds.has(node.id));
  const bounds = boundsOf(inArea);
  if (!bounds) return null;
  return {
    x: bounds.x - AREA_PADDING,
    y: bounds.y - AREA_PADDING - AREA_HEADING,
    width: bounds.width + AREA_PADDING * 2,
    height: bounds.height + AREA_PADDING * 2 + AREA_HEADING
  };
}

function boundsOf(nodes: ReadonlyArray<Node<any>>): Rect | null {
  if (!nodes.length) return null;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const node of nodes) {
    const width = node.measured?.width ?? node.width ?? AUTOMATION_FLOW_NODE_WIDTH;
    const height = node.measured?.height ?? node.height ?? AUTOMATION_FLOW_NODE_HEIGHT;
    left = Math.min(left, node.position.x);
    top = Math.min(top, node.position.y);
    right = Math.max(right, node.position.x + width);
    bottom = Math.max(bottom, node.position.y + height);
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function expand(rect: Rect, by: number): Rect {
  return { x: rect.x - by, y: rect.y - by, width: rect.width + by * 2, height: rect.height + by * 2 };
}

function overlaps(left: Rect, right: Rect): boolean {
  return left.x < right.x + right.width && right.x < left.x + left.width && left.y < right.y + right.height && right.y < left.y + left.height;
}
