import type { JsonObject } from "../../core.js";

export type StateCoordinateSpace = {
  width: number;
  height: number;
  unit: "px" | "world" | "cell" | "normalized";
  origin?: "top-left" | "bottom-left" | "center";
  scale?: number;
  metadata?: JsonObject;
};
