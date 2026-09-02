import { createHash } from "node:crypto";

export const AUTOMATION_STUDIO_PAGE_CURSOR_VERSION = 1 as const;
export const AUTOMATION_STUDIO_DEFAULT_PAGE_LIMIT = 50;
export const AUTOMATION_STUDIO_MAX_PAGE_LIMIT = 200;

export type AutomationStudioPageCursor<TValues extends Record<string, unknown>> = {
  version: typeof AUTOMATION_STUDIO_PAGE_CURSOR_VERSION;
  owner: string;
  filterHash: string;
  values: TValues;
};

export function automationStudioPageLimit(value: unknown, fallback = AUTOMATION_STUDIO_DEFAULT_PAGE_LIMIT): number {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) ? Math.max(1, Math.min(AUTOMATION_STUDIO_MAX_PAGE_LIMIT, parsed)) : fallback;
}

export function automationStudioFilterHash(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex").slice(0, 16);
}

export function encodeAutomationStudioPageCursor<TValues extends Record<string, unknown>>(input: Omit<AutomationStudioPageCursor<TValues>, "version">): string {
  return Buffer.from(JSON.stringify({ version: AUTOMATION_STUDIO_PAGE_CURSOR_VERSION, ...input }), "utf8").toString("base64url");
}

export function decodeAutomationStudioPageCursor<TValues extends Record<string, unknown>>(cursor: unknown, expected: { owner: string; filterHash: string; validate?: (values: Record<string, unknown>) => boolean }): TValues | null {
  if (cursor === undefined || cursor === null || cursor === "") return null;
  if (typeof cursor !== "string" || cursor.length > 2_048) throw new Error("Invalid paging cursor.");
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Partial<AutomationStudioPageCursor<TValues>>;
    if (parsed.version !== AUTOMATION_STUDIO_PAGE_CURSOR_VERSION || parsed.owner !== expected.owner || parsed.filterHash !== expected.filterHash || !parsed.values || typeof parsed.values !== "object") {
      throw new Error("Paging cursor does not match this query.");
    }
    if (expected.validate && !expected.validate(parsed.values as Record<string, unknown>)) throw new Error("Invalid paging cursor.");
    return parsed.values;
  } catch (error) {
    if (error instanceof Error && error.message === "Paging cursor does not match this query.") throw error;
    throw new Error("Invalid paging cursor.");
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
