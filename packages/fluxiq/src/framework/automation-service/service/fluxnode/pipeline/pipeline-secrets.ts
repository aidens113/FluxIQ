import { runWithAutomationStudioRunSecrets } from "../../../../../runtime/run-secrets/index.ts";
import { fluxNodeWithheldRecords } from "../secrets/index.ts";

/**
 * The secret values one pipeline run has met: each is the value a record field gave a mapped FluxNode's secret
 * input (`format: "secret"`). Held for the rest of the run, so everything the pipeline layer keeps or shows
 * after a call withholds them like a declared secret: the run's events and result (`onMet`), the datasets it
 * stores, the outputs a call gives back, and the state it remembers.
 */
export class PipelineSecrets {
  private readonly met = new Set<string>();

  constructor(private readonly onMet: (texts: readonly string[]) => void) {}

  get texts(): string[] {
    return [...this.met];
  }

  /** Takes these values in, for the rest of the run. */
  meet(texts: readonly string[]): void {
    const fresh = texts.filter((text) => text !== "" && !this.met.has(text));
    if (!fresh.length) return;
    for (const text of fresh) this.met.add(text);
    this.onMet(fresh);
  }

  /** Runs `fn` with the values met so far as the run's secret frame (`runtime/run-secrets/`), so a call started in it, and what that call starts, withholds them too. */
  within<T>(fn: () => T): T {
    return runWithAutomationStudioRunSecrets(Object.fromEntries(this.texts.map((text, index) => [`pipeline.secret${index}`, text])), fn);
  }

  /** `data` with the values met so far withheld. */
  withheld<T>(data: T): T {
    return fluxNodeWithheldRecords(data, this.texts);
  }
}
