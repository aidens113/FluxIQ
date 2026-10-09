// The steps a candidate build's last refused submission was refused at, in the
// model's own words, beside the failure that stopped it (t378).
//
// **Why.** A build's failure carries codes, never a sentence (`./diagnostic.ts`),
// so the last refused submission travels as codes in `issueCodes`
// (`../../service/candidate-failure/refusal-codes.ts`) and the chat's ending
// could say only "a step was given a setting it doesn't take". The refusal card
// in the chat names the step ("keep requests with 5 or more mutual friends",
// lane D); the ending could not.
//
// So the failure carries, beside those codes, a few of the refused steps'
// descriptions as the model wrote them, each with the script line or plan path
// its issue is placed at and that issue's code, so the reader pairs each with
// its issue -- by place, or by code where the issue's code travelled without
// its place (a plan path too long to fit in an issue code). The
// producer screens each description first (handles, node ids and codes left
// out, the activity stream's own screen); this holds what is stored to its
// bounds -- a few entries, each short, on one line -- on both sides, producer
// and reader, as every other field of the diagnostic is.

/** One refused step: its description as the model wrote it, screened, where its issue is placed, and that issue's code. */
export type AutomationStudioFlowBootstrapRefusedStep = { step: string; line?: number; path?: string; code?: string };

/** The most steps carried; the ending names at most two per reason. */
const MAX_STEPS = 4;
/** The most characters of one step's words stored. */
const MAX_STEP_LENGTH = 120;
/** A path or a code, as an issue code carries them (`plan.subflows.0.nodes.13.parameters`, `bootstrap.unknown_parameter`). */
const PATH = /^[A-Za-z0-9_.:-]{1,100}$/u;
const CONTROL = /[\u0000-\u001f\u007f]/u;

function entry(value: unknown): AutomationStudioFlowBootstrapRefusedStep | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => key !== "step" && key !== "line" && key !== "path" && key !== "code")) return undefined;
  const { step, line, path, code } = record;
  if (typeof step !== "string" || !step.trim() || step.length > MAX_STEP_LENGTH || CONTROL.test(step)) return undefined;
  if (line !== undefined && (typeof line !== "number" || !Number.isSafeInteger(line) || line < 0)) return undefined;
  if (path !== undefined && (typeof path !== "string" || !PATH.test(path))) return undefined;
  if (code !== undefined && (typeof code !== "string" || !PATH.test(code))) return undefined;
  if (line === undefined && path === undefined) return undefined;
  return { step, ...(line !== undefined ? { line } : {}), ...(path !== undefined ? { path } : {}), ...(code !== undefined ? { code } : {}) };
}

export const automationStudioFlowBootstrapRefusedSteps = Object.freeze({
  /** What a failure may carry of `steps`: placed, within bounds, once per place, at most four; the rest left out. */
  bounded(steps: readonly { step?: string | undefined; line?: number | undefined; path?: string | undefined; code?: string | undefined }[]): AutomationStudioFlowBootstrapRefusedStep[] {
    const kept: AutomationStudioFlowBootstrapRefusedStep[] = [];
    const places = new Set<string>();
    for (const step of steps) {
      const words = typeof step.step === "string" ? step.step.replace(/\s+/gu, " ").trim().slice(0, MAX_STEP_LENGTH) : undefined;
      // A code is carried as the issue code carries it, without what follows its `:`.
      const code = step.code?.split(":")[0];
      const read = entry({ step: words, ...(step.line !== undefined ? { line: step.line } : {}), ...(step.path !== undefined && PATH.test(step.path) ? { path: step.path } : {}), ...(code && PATH.test(code) ? { code } : {}) });
      if (!read) continue;
      const place = read.line !== undefined ? `line.${read.line}` : read.path!;
      if (places.has(place)) continue;
      places.add(place);
      kept.push(read);
      if (kept.length === MAX_STEPS) break;
    }
    return kept;
  },
  /** A stored list read back: `undefined` when there is none, `null` when what is there is not one Core wrote. */
  parse(value: unknown): AutomationStudioFlowBootstrapRefusedStep[] | null | undefined {
    if (value === undefined) return undefined;
    if (!Array.isArray(value) || !value.length || value.length > MAX_STEPS) return null;
    const read = value.map(entry);
    return read.every((step): step is AutomationStudioFlowBootstrapRefusedStep => step !== undefined) ? read : null;
  }
});
