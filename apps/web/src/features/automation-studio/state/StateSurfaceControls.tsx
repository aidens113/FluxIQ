import { RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import type { StateVisualSurfaceMode } from "./state-visual-types";

const stateCanvasZoomLevels = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4] as const;

export function StateCanvasSurfaceControls(props: { surface: StateVisualSurfaceMode; onSurface(surface: StateVisualSurfaceMode): void }) {
  return (
    <div className="automation-state-surface-tabs" aria-label="Visual state surface" role="group">
      {(["document", "screenshot"] as const).map((surface) => <button aria-pressed={props.surface === surface} key={surface} onClick={() => props.onSurface(surface)} type="button">{surface === "document" ? "Document" : "Screenshot"}</button>)}
    </div>
  );
}

export function StateCanvasZoomControls(props: { zoom: number; onZoomChange(zoom: number): void }) {
  const zoomIndex = nearestZoomIndex(props.zoom);
  return (
    <div className="automation-state-zoom-controls" aria-label="Canvas zoom controls">
      <button aria-label="Zoom out" disabled={zoomIndex <= 0} onClick={() => props.onZoomChange(stateCanvasZoomLevels[Math.max(0, zoomIndex - 1)]!)} title="Zoom out" type="button"><ZoomOut size={14} aria-hidden /></button>
      <span aria-label="Canvas zoom">{Math.round(props.zoom * 100)}%</span>
      <button aria-label="Zoom in" disabled={zoomIndex >= stateCanvasZoomLevels.length - 1} onClick={() => props.onZoomChange(stateCanvasZoomLevels[Math.min(stateCanvasZoomLevels.length - 1, zoomIndex + 1)]!)} title="Zoom in" type="button"><ZoomIn size={14} aria-hidden /></button>
      <button aria-label="Reset zoom" disabled={props.zoom === 1} onClick={() => props.onZoomChange(1)} title="Reset zoom" type="button"><RotateCcw size={14} aria-hidden /></button>
    </div>
  );
}

export function nearestZoomIndex(zoom: number): number {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  stateCanvasZoomLevels.forEach((level, index) => {
    const distance = Math.abs(level - zoom);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestIndex;
}
