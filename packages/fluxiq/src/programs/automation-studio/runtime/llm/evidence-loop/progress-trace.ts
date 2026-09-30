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
//
// Since 2026-09-30 (lane t195) it also says what an amendment changed and why a
// completion was refused, in the same closed vocabulary: `amend=` lists each
// amendment's step number and change word (with the step numbers `over`,
// `through`, `to` and `check` name), `acts=` a completion's act claims as
// act:step identifiers, and `missing=` each missing act's id and reason code.
// Run `run-munsxchc-15523952` ended on four `bootstrap.instructed_act_missing`
// refusals and 13 amendments, and the log could say neither which act nor what
// any amendment tried.
//
// The same wrapper feeds the full decision dump (`./decision-dump.ts`) when
// `FLUXIQ_BUILD_DECISION_DUMP` is set; either switch alone turns the wrapper on.
import { automationStudioLlmEvidenceDecisionDump } from "./decision-dump.ts";

// Method signatures, so any loop input whose own requests carry more fields fits.
type Traceable = {
  decide(input: { iteration: number }): Promise<unknown>;
  executeTool(input: { callId: string; toolId: string }): Promise<unknown>;
  checkCompletion?: ((result: never, context: never) => unknown) | undefined;
};

/** The loop's input, with its two waits timed when the trace or the dump is switched on; the same object when neither is. */
export function automationStudioLlmEvidenceLoopProgressTrace<T extends Traceable>(input: T, env: Readonly<Record<string, string | undefined>> = process.env, write: (line: string) => void = (line) => console.log(line)): T {
  const tracing = env.FLUXIQ_BUILD_PROGRESS_TRACE === "1";
  const dump = automationStudioLlmEvidenceDecisionDump(env);
  if (!tracing && !dump) return input;
  const log = (line: string) => { if (tracing) write(`[FluxIQ build-trace] ${new Date().toISOString()} ${line}`); };
  log("loop start");
  const decide = async (request: Parameters<T["decide"]>[0]) => {
    const started = Date.now();
    log(`decide start iteration=${request.iteration}`);
    try {
      const decision = await input.decide(request);
      log(`decide end iteration=${request.iteration} ms=${Date.now() - started} kind=${codeOf((decision as { kind?: unknown } | undefined)?.kind)}${decisionDetail(decision)}`);
      dump?.decision({ iteration: request.iteration, ms: Date.now() - started, evidence: (request as { evidence?: unknown }).evidence, decision });
      return decision;
    } catch (error) {
      log(`decide throw iteration=${request.iteration} ms=${Date.now() - started} ${errorCodes(error)}`);
      throw error;
    }
  };
  const executeTool = async (request: Parameters<T["executeTool"]>[0]) => {
    const started = Date.now();
    log(`tool start callId=${callIdOf(request.callId)} toolId=${codeOf(request.toolId)}`);
    try {
      const result = await input.executeTool(request);
      log(`tool end toolId=${codeOf(request.toolId)} ms=${Date.now() - started} resultCode=${codeOf((result as { resultCode?: unknown } | undefined)?.resultCode)}`);
      dump?.tool({ callId: request.callId, toolId: request.toolId, ms: Date.now() - started, request, result });
      return result;
    } catch (error) {
      log(`tool throw toolId=${codeOf(request.toolId)} ms=${Date.now() - started} ${errorCodes(error)}`);
      throw error;
    }
  };
  const check = input.checkCompletion;
  const checkCompletion = check === undefined ? undefined : async (...args: Parameters<NonNullable<T["checkCompletion"]>>) => {
    const verdict = await (check as (...inner: typeof args) => unknown).apply(input, args) as { ok?: unknown; issueCodes?: unknown; feedback?: unknown } | undefined;
    const issues = Array.isArray(verdict?.issueCodes) ? verdict.issueCodes.map(codeOf).join(",") || "-" : "-";
    log(`completion check ok=${verdict?.ok === true} issues=${issues}${missingActs(verdict?.feedback)}`);
    dump?.check({ verdict });
    return verdict;
  };
  return { ...input, decide, executeTool, ...(checkCompletion ? { checkCompletion } : {}) } as T;
}

/**
 * A call id only when it is a numbered id (`c18`, `call.1`) or Core's own
 * (`initial.<tool>`). The model writes call ids, and one that spells out what it
 * is doing carries the instruction's words into the log (`run-muntmwvx-0d53884a`).
 */
function callIdOf(value: unknown): string {
  return typeof value === "string" && /^(?:[A-Za-z]{1,6}[._-]?\d{1,4}|initial\.[A-Za-z0-9_.:-]{1,80})$/u.test(value) ? value : "-";
}

/** At most this many amendments, claims or missing acts are named on one line. */
const MAX_LISTED = 16;

/** What an amendment or a completion carried, in step numbers and closed words; empty for any other decision. */
function decisionDetail(decision: unknown): string {
  const record = asRecord(decision);
  if (record?.kind === "amend_draft" && Array.isArray(record.amendments)) {
    const listed = record.amendments.slice(0, MAX_LISTED).map((item) => {
      const amendment = asRecord(item) ?? {};
      const named = ["over", "through", "to", "check"].flatMap((key) => (numberOf(amendment[key]) === "-" ? [] : [`${key}=${numberOf(amendment[key])}`]));
      return `${numberOf(amendment.step)}:${codeOf(amendment.change)}${named.length ? `(${named.join(",")})` : ""}`;
    });
    return ` amend=${listed.join(",") || "-"}`;
  }
  if (record?.kind === "complete") {
    const acts = asRecord(record.result)?.acts;
    const claims = Array.isArray(acts)
      ? acts.slice(0, MAX_LISTED).map((item) => {
        const claim = asRecord(item) ?? {};
        return `${codeOf(claim.action ?? claim.act ?? claim.name)}>${codeOf(typeof claim.step === "number" ? `${claim.step}` : claim.step)}`;
      })
      : asRecord(acts) ? Object.entries(asRecord(acts)!).slice(0, MAX_LISTED).map(([act, step]) => `${codeOf(act)}>${codeOf(typeof step === "number" ? `${step}` : step)}`) : [];
    return ` acts=${claims.join(",") || "-"}`;
  }
  return "";
}

/** Each missing act of a refused completion as id:reason, from the feedback's own `missingActs`. */
function missingActs(feedback: unknown): string {
  const acts = asRecord(asRecord(feedback)?.missingActs)?.acts;
  if (!Array.isArray(acts) || !acts.length) return "";
  return ` missing=${acts.slice(0, MAX_LISTED).map((item) => `${codeOf(asRecord(item)?.id)}:${codeOf(asRecord(item)?.reason)}`).join(",")}`;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function numberOf(value: unknown): string {
  return typeof value === "number" && Number.isSafeInteger(value) ? `${value}` : "-";
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
