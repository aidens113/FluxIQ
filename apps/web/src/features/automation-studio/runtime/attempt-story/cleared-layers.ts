import type { RuntimeAttemptStoryLine } from "./story-line";

/** Each kind of layer the client closes, as a person names it. */
const LAYER: Readonly<Record<string, string>> = Object.freeze({
  consent: "a cookie or consent notice",
  rate_limit: "a slow-down notice",
  promotion: "a promotion",
  assistant: "a chat or assistant pop-up",
  dialog: "a dialog"
});

/**
 * The `clearedLayers` record (Core's state-aware recovery plan, C11): the
 * layers the client closed over the page while the step ran, the one act a
 * run takes that no Flow authored. Told by kind only; the control's own words
 * are page text and stay in the Raw JSON tab.
 */
export function runtimeClearedLayersLine(attempt: unknown): RuntimeAttemptStoryLine | undefined {
  const record = attempt as { clearedLayers?: unknown; metadata?: unknown };
  const metadata = typeof record.metadata === "object" && record.metadata !== null ? record.metadata as { clearedLayers?: unknown } : {};
  const layers: unknown[] = Array.isArray(record.clearedLayers) ? record.clearedLayers : Array.isArray(metadata.clearedLayers) ? metadata.clearedLayers : [];
  const kinds = layers.map((layer) => LAYER[String((layer as { kind?: unknown } | null)?.kind)] ?? "a notice");
  if (!kinds.length) return undefined;
  if (kinds.length === 1) return { kind: "cleared_layers", text: `Closed a notice the page put in the way: ${kinds[0]}.` };
  return { kind: "cleared_layers", text: `Closed ${kinds.length} notices the page put in the way: ${kinds.slice(0, -1).join(", ")} and ${kinds.at(-1)}.` };
}
