// The sites a part runs on, as origins and nothing finer.
import type { AutomationStudioPartStep } from "./steps.ts";

/** The origin of an http or https address, or undefined for anything else. Never a path or a query. */
export function partOriginOf(address: unknown): string | undefined {
  if (typeof address !== "string" || !URL.canParse(address)) return undefined;
  const url = new URL(address);
  return url.protocol === "http:" || url.protocol === "https:" ? url.origin : undefined;
}

/** Whether a step navigates: it names an address of its own to go to. */
export function partStepNavigates(step: AutomationStudioPartStep): boolean {
  return step.acting && !step.isCall && /navigate/iu.test(step.kind) && typeof step.params.url === "string";
}

/**
 * The origins the steps navigate to by a literal address, and the build's start
 * location, sorted and each once. A navigation bound to an input names no site.
 */
export function partSitesOf(steps: readonly AutomationStudioPartStep[], startLocation: string | undefined): string[] {
  const sites = new Set<string>();
  const start = partOriginOf(startLocation);
  if (start) sites.add(start);
  for (const step of steps) {
    if (!partStepNavigates(step)) continue;
    const origin = partOriginOf(step.params.url);
    if (origin) sites.add(origin);
  }
  return [...sites].sort();
}
