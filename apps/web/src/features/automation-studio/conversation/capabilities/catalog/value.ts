// Reading a supplied argument into the shape the request wants.

import type { PanelCapabilityArguments } from "../contract";

/** A value as a request field. Absent reads as empty, never as the word `null`. */
export function str(args: PanelCapabilityArguments, name: string): string {
  const value = args[name];
  if (value === null || value === undefined) return "";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

/**
 * A structured argument, spread into the request.
 *
 * A value that is not an object spreads as nothing rather than throwing: the
 * endpoint then refuses it naming the field it actually wanted, which is more
 * use to whoever asked than a parse error invented by the panel. Text that is
 * not JSON at all is the same case and is treated the same way -- but only
 * `SyntaxError` is; anything else thrown out of `JSON.parse` is a fault in this
 * panel, not a badly-typed argument, and is left to propagate.
 */
export function json(args: PanelCapabilityArguments, name: string): Record<string, unknown> {
  const value = args[name];
  if (value === null || value === undefined) return {};
  if (typeof value === "object") return Array.isArray(value) ? {} : { ...(value as Record<string, unknown>) };
  if (typeof value !== "string") return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return {};
  }
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? { ...(parsed as Record<string, unknown>) } : {};
}
