// Where a running loop is spending its time, printed as it happens.
//
// Two live builds stopped with no record of where they had been: run
// `run-mun5e1ie-5aeefbbd` reached its first decision call after 239 s, and
// `run-mun8tgdh-36ae87a2` ran 675 s and was abandoned by the Lab with one call
// counted. A failed or abandoned build stores no trace, and the Lab deletes the
// run's Core store with the run, so the one surviving channel is the Core
// process's own output, which the Lab keeps as `logs/core.log`.
//
// Off unless `FLUXIQ_BUILD_PROGRESS_TRACE=1`. Content-free when on: iteration
// numbers, tool ids, decision kinds, durations, and error names and codes --
// never evidence, inputs, instructions, messages or page text.

// Method signatures, so any loop input whose own requests carry more fields fits.
type Traceable = {
  decide(input: { iteration: number }): Promise<unknown>;
  executeTool(input: { callId: string; toolId: string }): Promise<unknown>;
  checkCompletion?: ((result: never, context: never) => unknown) | undefined;
};

/** The loop's input, with its two waits timed when the trace is switched on; the same object when it is not. */
export function automationStudioLlmEvidenceLoopProgressTrace<T extends Traceable>(input: T, env: Readonly<Record<string, string | undefined>> = process.env, write: (line: string) => void = (line) => console.log(line)): T {
  if (env.FLUXIQ_BUILD_PROGRESS_TRACE !== "1") return input;
  const log = (line: string) => write(`[FluxIQ build-trace] ${new Date().toISOString()} ${line}`);
  log("loop start");
  const decide = async (request: Parameters<T["decide"]>[0]) => {
    const started = Date.now();
    log(`decide start iteration=${request.iteration}`);
    try {
      const decision = await input.decide(request);
      log(`decide end iteration=${request.iteration} ms=${Date.now() - started} kind=${codeOf((decision as { kind?: unknown } | undefined)?.kind)}`);
      return decision;
    } catch (error) {
      log(`decide throw iteration=${request.iteration} ms=${Date.now() - started} ${errorCodes(error)}`);
      throw error;
    }
  };
  const executeTool = async (request: Parameters<T["executeTool"]>[0]) => {
    const started = Date.now();
    log(`tool start callId=${codeOf(request.callId)} toolId=${codeOf(request.toolId)}`);
    try {
      const result = await input.executeTool(request);
      log(`tool end toolId=${codeOf(request.toolId)} ms=${Date.now() - started} resultCode=${codeOf((result as { resultCode?: unknown } | undefined)?.resultCode)}`);
      return result;
    } catch (error) {
      log(`tool throw toolId=${codeOf(request.toolId)} ms=${Date.now() - started} ${errorCodes(error)}`);
      throw error;
    }
  };
  const check = input.checkCompletion;
  const checkCompletion = check === undefined ? undefined : async (...args: Parameters<NonNullable<T["checkCompletion"]>>) => {
    const verdict = await (check as (...inner: typeof args) => unknown).apply(input, args) as { ok?: unknown; issueCodes?: unknown } | undefined;
    const issues = Array.isArray(verdict?.issueCodes) ? verdict.issueCodes.map(codeOf).join(",") || "-" : "-";
    log(`completion check ok=${verdict?.ok === true} issues=${issues}`);
    return verdict;
  };
  return { ...input, decide, executeTool, ...(checkCompletion ? { checkCompletion } : {}) } as T;
}

/** A code-shaped value, or `-`: never a sentence, so nothing but an identifier reaches the log. */
function codeOf(value: unknown): string {
  return typeof value === "string" && /^[A-Za-z0-9_.:-]{1,120}$/u.test(value) ? value : "-";
}

function errorCodes(error: unknown): string {
  const record = (typeof error === "object" && error !== null ? error : {}) as { name?: unknown; code?: unknown; diagnostic?: { code?: unknown; issueCodes?: unknown } };
  const issues = Array.isArray(record.diagnostic?.issueCodes) ? record.diagnostic.issueCodes.map(codeOf).join(",") : "-";
  return `name=${codeOf(record.name)} code=${codeOf(record.code ?? record.diagnostic?.code)} issues=${issues}`;
}
