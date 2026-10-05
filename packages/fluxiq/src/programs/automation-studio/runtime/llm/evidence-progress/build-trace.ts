// One `[FluxIQ build-trace]` line, for the steps of a build outside its loop.
//
// The loop's own lines are written by `./progress-trace.ts`. A build also
// judges its tests, stores its proposal and is applied, and none of that was
// traced: run `run-musq0b1m-0472cfa0` spent 17.1 s between its last judge and
// the chat's ending in no record at all (t174-w116, its debug's R3). The same
// switch (`FLUXIQ_BUILD_PROGRESS_TRACE=1`), the same prefix and moment, and the
// same rule: content-free -- step names, durations, verdict words and error
// names and codes, never a sentence.

/** A code-shaped value, or `-`: never a sentence. */
function codeOf(value: unknown): string {
  return typeof value === "string" && /^[A-Za-z0-9_.:-]{1,120}$/u.test(value) ? value : "-";
}

/** Each `key=value` pair with its value held to a code, so an outcome never carries words. */
function coded(outcome: string): string {
  return outcome.split(/\s+(?=[A-Za-z][\w.-]*=)/u).map((pair) => {
    const at = pair.indexOf("=");
    return at > 0 ? `${codeOf(pair.slice(0, at))}=${codeOf(pair.slice(at + 1))}` : codeOf(pair);
  }).join(" ");
}

type Env = Readonly<Record<string, string | undefined>>;
type Write = (line: string) => void;
const console_log: Write = (line) => console.log(line);

export const automationStudioLlmBuildTrace = Object.freeze({
  /** Whether the build trace is switched on. */
  on(env: Env = process.env): boolean {
    return env.FLUXIQ_BUILD_PROGRESS_TRACE === "1";
  },
  /** One line, `[FluxIQ build-trace] <ISO moment> <text>`, when the trace is on. */
  line(text: string, env: Env = process.env, write: Write = console_log): void {
    if (env.FLUXIQ_BUILD_PROGRESS_TRACE === "1") write(`[FluxIQ build-trace] ${new Date().toISOString()} ${text}`);
  },
  /**
   * `<label> start`, then `<label> end ms=<n> <outcome>` or `<label> throw
   * ms=<n> name=<name> code=<code>`, around `run`; returns or throws exactly
   * what `run` did. `outcome` is `key=value` pairs, each value held to a code.
   */
  async timed<T>(label: string, run: () => Promise<T>, outcome?: (value: T) => string, env: Env = process.env, write: Write = console_log): Promise<T> {
    if (env.FLUXIQ_BUILD_PROGRESS_TRACE !== "1") return await run();
    const name = codeOf(label);
    const say = (text: string) => write(`[FluxIQ build-trace] ${new Date().toISOString()} ${text}`);
    const started = Date.now();
    say(`${name} start`);
    try {
      const value = await run();
      let said = "";
      try {
        said = outcome ? coded(outcome(value)) : "";
      } catch {
        said = "";
      }
      say(`${name} end ms=${Date.now() - started}${said ? ` ${said}` : ""}`);
      return value;
    } catch (error) {
      const record = (typeof error === "object" && error !== null ? error : {}) as { name?: unknown; code?: unknown };
      say(`${name} throw ms=${Date.now() - started} name=${codeOf(record.name)} code=${codeOf(record.code)}`);
      throw error;
    }
  }
});
