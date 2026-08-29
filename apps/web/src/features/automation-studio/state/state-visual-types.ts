export type StateViewMode = "visual" | "structured" | "diff" | "compare" | "raw";
export type StateVisualSurfaceMode = "screenshot" | "document";
export type StateBoundsKind = "screenshot" | "document";
export type StateRenderKind = "screenshot-bbox" | "direct-rendered";
export type StateBounds = { x: number; y: number; width: number; height: number };
export type StateSize = Pick<StateBounds, "width" | "height">;
export type StateVisualMetrics = { surface: StateVisualSurfaceMode; coordinate: StateSize; image: StateSize; aspect: StateSize; scroll: { x: number; y: number }; viewport?: StateBounds };
export type DirectRenderedTextCandidate = { id: string; bounds: StateBounds; content: string; area: number };
