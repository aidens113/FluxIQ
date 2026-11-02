import type { JsonObject } from "../../core/index.ts";

/** A native execution's diagnostic entry, independent of its editor or host. */
export type AutomationStudioNativeLogEntry = {
  level: "debug" | "info" | "warning" | "error";
  message: string;
  data?: JsonObject;
};
