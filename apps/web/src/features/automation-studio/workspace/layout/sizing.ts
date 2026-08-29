import type { AutomationLayoutPresetOption, AutomationSharedResizePartner, AutomationWindowPixelGeometry, AutomationWindowRelativeGeometry, AutomationWindowResizeEdge, AutomationWorkspaceWindow, AutomationWorkspaceWindowPixels } from "./contracts";

export function nextAutomationZIndex(windows: AutomationWorkspaceWindow[]): number {
  return Math.max(0, ...windows.map((item) => item.zIndex ?? 0)) + 1;
}

export function automationWindowGeometrySignature(windows: AutomationWorkspaceWindow[]): string {
  return windows.map((item) => `${item.id}:${item.area}:${item.xPct},${item.yPct},${item.widthPct},${item.heightPct}`).join("|");
}

export function automationWindowFillsCanvas(windowItem: AutomationWindowPixelGeometry, canvasWidth: number, canvasHeight: number): boolean {
  return windowItem.x <= 2
    && windowItem.y <= 2
    && Math.abs(windowItem.widthPx - canvasWidth) <= 3
    && Math.abs(windowItem.heightPx - canvasHeight) <= 3;
}

export function restoreAutomationWindowFromFullscreen(
  windowItem: AutomationWorkspaceWindowPixels,
  pointerX: number,
  pointerY: number,
  canvasWidth: number,
  canvasHeight: number
): AutomationWindowPixelGeometry {
  const widthPx = Math.min(Math.max(360, Math.round(canvasWidth * 0.62)), Math.min(860, canvasWidth));
  const heightPx = Math.min(Math.max(260, Math.round(canvasHeight * 0.62)), Math.min(560, canvasHeight));
  const ratioX = clampNumber(pointerX / Math.max(1, canvasWidth), 0.15, 0.85, 0.5);
  const x = pointerX - widthPx * ratioX;
  const y = Math.max(0, pointerY - 24);
  return clampAutomationWindowPixelGeometry({ x, y, widthPx, heightPx }, canvasWidth, canvasHeight, 240, 210);
}

export function clampAutomationWindowPixelGeometry(
  windowItem: AutomationWindowPixelGeometry,
  maxWidth: number,
  maxHeight: number,
  minWidth = 360,
  minHeight = 320
): AutomationWindowPixelGeometry {
  const effectiveMinWidth = Math.min(minWidth, maxWidth);
  const effectiveMinHeight = Math.min(minHeight, maxHeight);
  const widthPx = clampNumber(windowItem.widthPx, effectiveMinWidth, maxWidth, Math.min(1040, maxWidth));
  const heightPx = clampNumber(windowItem.heightPx, effectiveMinHeight, maxHeight, Math.min(640, maxHeight));
  return {
    widthPx,
    heightPx,
    x: clampNumber(windowItem.x, 0, Math.max(0, maxWidth - widthPx), 0),
    y: clampNumber(windowItem.y, 0, Math.max(0, maxHeight - heightPx), 0)
  };
}

export function automationWindowToPixels(
  windowItem: AutomationWorkspaceWindow,
  canvasWidth: number,
  canvasHeight: number,
  minWidth = 240,
  minHeight = 210
): AutomationWorkspaceWindowPixels {
  const geometry = clampAutomationWindowPixelGeometry({
    x: (clampNumber(windowItem.xPct, 0, 100, 0) / 100) * canvasWidth,
    y: (clampNumber(windowItem.yPct, 0, 100, 0) / 100) * canvasHeight,
    widthPx: (clampNumber(windowItem.widthPct, 1, 100, 100) / 100) * canvasWidth,
    heightPx: (clampNumber(windowItem.heightPct, 1, 100, 100) / 100) * canvasHeight
  }, canvasWidth, canvasHeight, minWidth, minHeight);
  return { ...windowItem, ...geometry };
}

export function automationPixelsToRelativeGeometry(
  geometry: AutomationWindowPixelGeometry,
  canvasWidth: number,
  canvasHeight: number
): AutomationWindowRelativeGeometry {
  const width = Math.max(1, canvasWidth);
  const height = Math.max(1, canvasHeight);
  const clamped = clampAutomationWindowPixelGeometry(geometry, width, height, 1, 1);
  return {
    xPct: roundAutomationPercent((clamped.x / width) * 100),
    yPct: roundAutomationPercent((clamped.y / height) * 100),
    widthPct: roundAutomationPercent((clamped.widthPx / width) * 100),
    heightPct: roundAutomationPercent((clamped.heightPx / height) * 100)
  };
}

export function roundAutomationPercent(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function layoutAutomationWindowsInPreset(
  windows: AutomationWorkspaceWindow[],
  preset: AutomationLayoutPresetOption,
  canvasWidth: number,
  canvasHeight: number
): AutomationWorkspaceWindow[] {
  const assignments = new Map<number, AutomationWorkspaceWindow[]>();
  windows.forEach((windowItem, index) => {
    const cellIndex = preset.id === "main-sidebar" && index > 0 ? 1 : index % preset.cells.length;
    const bucket = assignments.get(cellIndex) ?? [];
    bucket.push(windowItem);
    assignments.set(cellIndex, bucket);
  });

  return windows.map((windowItem, index) => {
    const cellIndex = preset.id === "main-sidebar" && index > 0 ? 1 : index % preset.cells.length;
    const cell = preset.cells[cellIndex] ?? preset.cells[0]!;
    const bucket = assignments.get(cellIndex) ?? [windowItem];
    const bucketIndex = bucket.findIndex((item) => item.id === windowItem.id);
    const splitCount = Math.max(1, bucket.length);
    const cellWidth = Math.max(240, Math.round(cell.w * canvasWidth));
    const cellHeight = Math.max(210, Math.floor((cell.h * canvasHeight) / splitCount));
    const geometry = automationPixelsToRelativeGeometry(clampAutomationWindowPixelGeometry({
      x: Math.round(cell.x * canvasWidth),
      y: Math.round(cell.y * canvasHeight) + bucketIndex * cellHeight,
      widthPx: cellWidth,
      heightPx: cellHeight
    }, canvasWidth, canvasHeight, Math.min(360, cellWidth), Math.min(320, cellHeight)), canvasWidth, canvasHeight);
    return {
      ...windowItem,
      ...geometry,
      zIndex: index + 1
    };
  });
}

export function findAutomationSharedResizePartners(
  windowItem: AutomationWorkspaceWindowPixels,
  edge: AutomationWindowResizeEdge,
  windows: AutomationWorkspaceWindowPixels[]
): AutomationSharedResizePartner[] {
  const threshold = 14;
  const partners = new Map<string, AutomationSharedResizePartner>();
  const left = windowItem.x;
  const right = windowItem.x + windowItem.widthPx;
  const top = windowItem.y;
  const bottom = windowItem.y + windowItem.heightPx;
  for (const item of windows) {
    if (item.id === windowItem.id) continue;
    const itemRight = item.x + item.widthPx;
    const itemBottom = item.y + item.heightPx;
    if (edge.includes("east") && Math.abs(item.x - right) <= threshold && automationRangesOverlap(top, bottom, item.y, itemBottom)) {
      partners.set(`${item.id}:west`, { id: item.id, side: "west", start: item });
    }
    if (edge.includes("west") && Math.abs(itemRight - left) <= threshold && automationRangesOverlap(top, bottom, item.y, itemBottom)) {
      partners.set(`${item.id}:east`, { id: item.id, side: "east", start: item });
    }
    if (edge.includes("south") && Math.abs(item.y - bottom) <= threshold && automationRangesOverlap(left, right, item.x, itemRight)) {
      partners.set(`${item.id}:north`, { id: item.id, side: "north", start: item });
    }
    if (edge.includes("north") && Math.abs(itemBottom - top) <= threshold && automationRangesOverlap(left, right, item.x, itemRight)) {
      partners.set(`${item.id}:south`, { id: item.id, side: "south", start: item });
    }
  }
  return [...partners.values()];
}

export function constrainAutomationResizeDelta(
  value: number,
  axis: "x" | "y",
  edge: AutomationWindowResizeEdge,
  windowItem: AutomationWindowPixelGeometry,
  partners: AutomationSharedResizePartner[],
  canvasSize: number
): number {
  const minSize = axis === "x" ? 240 : 210;
  const startPosition = axis === "x" ? windowItem.x : windowItem.y;
  const startSize = axis === "x" ? windowItem.widthPx : windowItem.heightPx;
  let minDelta = Number.NEGATIVE_INFINITY;
  let maxDelta = Number.POSITIVE_INFINITY;

  if ((axis === "x" && edge.includes("east")) || (axis === "y" && edge.includes("south"))) {
    minDelta = Math.max(minDelta, minSize - startSize);
    maxDelta = Math.min(maxDelta, canvasSize - (startPosition + startSize));
  }
  if ((axis === "x" && edge.includes("west")) || (axis === "y" && edge.includes("north"))) {
    minDelta = Math.max(minDelta, -startPosition);
    maxDelta = Math.min(maxDelta, startSize - minSize);
  }

  for (const partner of partners) {
    const partnerStart = axis === "x" ? partner.start.x : partner.start.y;
    const partnerSize = axis === "x" ? partner.start.widthPx : partner.start.heightPx;
    if ((axis === "x" && partner.side === "west") || (axis === "y" && partner.side === "north")) {
      minDelta = Math.max(minDelta, -partnerStart);
      maxDelta = Math.min(maxDelta, partnerSize - minSize);
    }
    if ((axis === "x" && partner.side === "east") || (axis === "y" && partner.side === "south")) {
      minDelta = Math.max(minDelta, minSize - partnerSize);
      maxDelta = Math.min(maxDelta, canvasSize - (partnerStart + partnerSize));
    }
  }

  if (!Number.isFinite(minDelta)) minDelta = value;
  if (!Number.isFinite(maxDelta)) maxDelta = value;
  return Math.min(maxDelta, Math.max(minDelta, value));
}

export function automationRangesOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
  return Math.min(endA, endB) - Math.max(startA, startB) > 24;
}

export function fullAutomationWindowGeometry(): AutomationWindowRelativeGeometry {
  return { xPct: 0, yPct: 0, widthPct: 100, heightPct: 100 };
}

export function placeAutomationWindow(windows: AutomationWorkspaceWindow[], bounds: DOMRect | undefined): AutomationWindowRelativeGeometry {
  const canvasWidth = Math.max(1, Math.floor(bounds?.width ?? 1120));
  const canvasHeight = Math.max(1, Math.floor(bounds?.height ?? 680));
  const gap = 8;
  const pixelWindows = windows.map((item) => automationWindowToPixels(item, canvasWidth, canvasHeight));
  const active = pixelWindows.reduce<AutomationWorkspaceWindowPixels | null>((latest, item) => !latest || item.zIndex > latest.zIndex ? item : latest, null);
  if (active) {
    const rightX = active.x + active.widthPx + gap;
    const rightSpace = canvasWidth - rightX;
    if (rightSpace >= 420) return automationPixelsToRelativeGeometry({ x: rightX, y: active.y, widthPx: rightSpace, heightPx: Math.min(active.heightPx, canvasHeight - active.y) }, canvasWidth, canvasHeight);
    const belowY = active.y + active.heightPx + gap;
    const belowSpace = canvasHeight - belowY;
    if (belowSpace >= 340) return automationPixelsToRelativeGeometry({ x: active.x, y: belowY, widthPx: Math.min(active.widthPx, canvasWidth - active.x), heightPx: belowSpace }, canvasWidth, canvasHeight);
  }
  const offset = windows.length * 34;
  return automationPixelsToRelativeGeometry(clampAutomationWindowPixelGeometry({
    x: offset,
    y: offset,
    widthPx: Math.min(1040, canvasWidth),
    heightPx: Math.min(640, canvasHeight)
  }, canvasWidth, canvasHeight), canvasWidth, canvasHeight);
}

export function automationSnapGeometry(canvasElement: HTMLDivElement | null, clientX: number, clientY: number): AutomationWindowPixelGeometry | null {
  if (!canvasElement) return null;
  const bounds = canvasElement.getBoundingClientRect();
  const threshold = 64;
  if (clientX < bounds.left || clientX > bounds.right || clientY < bounds.top || clientY > bounds.bottom) return null;
  const width = Math.max(1, bounds.width);
  const height = Math.max(1, bounds.height);
  const left = clientX - bounds.left <= threshold;
  const right = bounds.right - clientX <= threshold;
  const top = clientY - bounds.top <= threshold;
  const bottom = bounds.bottom - clientY <= threshold;
  if ((left || right) && (top || bottom)) return { x: 0, y: 0, widthPx: width, heightPx: height };
  if (left) return { x: 0, y: 0, widthPx: Math.floor(width / 2), heightPx: height };
  if (right) return { x: Math.floor(width / 2), y: 0, widthPx: Math.ceil(width / 2), heightPx: height };
  if (top) return { x: 0, y: 0, widthPx: width, heightPx: Math.floor(height / 2) };
  if (bottom) return { x: 0, y: Math.floor(height / 2), widthPx: width, heightPx: Math.ceil(height / 2) };
  return null;
}

export function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

