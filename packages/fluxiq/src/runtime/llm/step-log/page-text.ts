/** How deep a `page` field is looked for: `value.page.page` is depth 2 (the domain's `web-llm-page.v3`). */
const MAX_DEPTH = 4;

/**
 * The compact page text a tool result carries: the first string field named
 * `page` within four levels of the evidence, breadth first so the shallowest
 * wins. Undefined when there is none.
 */
export function automationStudioLlmStepLogPageText(evidence: unknown): string | undefined {
  let level: unknown[] = [evidence];
  for (let depth = 1; depth <= MAX_DEPTH && level.length; depth += 1) {
    const next: unknown[] = [];
    for (const value of level) {
      if (typeof value !== "object" || value === null) continue;
      if (!Array.isArray(value) && typeof (value as Record<string, unknown>).page === "string") return (value as Record<string, string>).page;
      next.push(...(Array.isArray(value) ? value : Object.values(value)));
    }
    level = next;
  }
  return undefined;
}
