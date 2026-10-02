import { automationStudioLlmStepLogAttempt } from "./attempts.ts";
import { automationStudioLlmStepLogDirectory } from "./directory.ts";
import { automationStudioLlmStepLogWriter } from "./files.ts";
import { automationStudioLlmStepLogFolderRefused, automationStudioLlmStepLogOpenFolder, type AutomationStudioLlmStepLogFolder } from "./folder.ts";
import { automationStudioLlmStepLogListStep } from "./listing.ts";
import { automationStudioLlmStepLogNaming } from "./naming.ts";
import { automationStudioLlmStepLogRequestText } from "./request-text.ts";
import { automationStudioLlmStepLogResponseText } from "./response-text.ts";
import { automationStudioLlmStepLogScope } from "./scope.ts";
import { automationStudioLlmStepLogSummary } from "./summary.ts";

/** What a model step's meta records of a call's token use. */
export type AutomationStudioLlmStepLogUsage = {
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  cacheHitInputTokens?: number | undefined;
  cacheMissInputTokens?: number | undefined;
  estimatedCostUsd?: number | undefined;
};

/** Everything a provider adapter knows of a call before it is sent. Never the credential, never a header. */
export type AutomationStudioLlmStepLogModelCall = {
  provider: string;
  model: string;
  url: string;
  /** The exact body string handed to `fetch`. */
  body: string;
  taskKind: string;
  /** The folder kind, where the task kind does not name it (`chat` for the panel). */
  kind?: string;
  requestId?: string | undefined;
  stage?: string | undefined;
  iteration?: number | undefined;
  /** What a reply's usage cost, for an adapter whose own parse does not price it. */
  price?: (usage: { inputTokens: number; outputTokens: number; cacheHitInputTokens: number }) => number;
};

/** One model exchange being written down. Every method is best-effort and returns nothing. */
export type AutomationStudioLlmStepLogModelStep = {
  /** The reply body exactly as it arrived, 2xx or not, with its HTTP status. */
  reply(raw: Uint8Array | string, status: number): void;
  /** What Core parsed the reply into. */
  succeeded(response: unknown, usage?: AutomationStudioLlmStepLogUsage): void;
  /** The failure the adapter threw. */
  failed(error: unknown): void;
};

/**
 * A model step: `NNNN-<kind>/` with `request.json` (the exact body) and
 * `request.txt` (it, readable) written now, before the call is sent, so a call
 * that never returns still shows what was asked. `response.json`,
 * `response.txt`, `decision.json` and last `meta.json` follow as the call
 * ends. Undefined, and nothing written, when the step log is off or its folder
 * could not be made.
 */
export function automationStudioLlmStepLogModelStep(call: AutomationStudioLlmStepLogModelCall, env: Readonly<Record<string, string | undefined>> = process.env): AutomationStudioLlmStepLogModelStep | undefined {
  const directory = automationStudioLlmStepLogDirectory(env);
  if (!directory) return undefined;
  const kind = call.kind ?? automationStudioLlmStepLogNaming.modelKind(call.taskKind);
  let folder: AutomationStudioLlmStepLogFolder;
  try {
    folder = automationStudioLlmStepLogOpenFolder(directory, kind);
  } catch (error) {
    // The disk refused the folder: no step, never a failed call.
    if (automationStudioLlmStepLogFolderRefused(error)) return undefined;
    throw error;
  }
  const started = Date.now();
  const scope = automationStudioLlmStepLogScope.current();
  const attempt = automationStudioLlmStepLogAttempt(call.requestId);
  const files = automationStudioLlmStepLogWriter(folder.path);
  files.text("request.json", call.body);
  files.text("request.txt", requestText(call));
  let envelope: Record<string, unknown> | undefined;
  let finishReason: string | undefined;
  let httpStatus: number | undefined;
  let done = false;
  const finish = (outcome: { response?: unknown; usage?: AutomationStudioLlmStepLogUsage | undefined; error?: unknown }) => {
    if (done) return;
    done = true;
    try {
      const failure = outcome.error === undefined ? undefined : errorRecord(outcome.error);
      files.json("decision.json", failure ? { error: failure } : { response: outcome.response, usage: outcome.usage ?? null });
      const usage = usageOf(outcome.usage) ?? usageOf(replyUsage(outcome.error)) ?? usageOf(paidUsage(outcome.error)) ?? usageOf(envelopeUsage(envelope));
      const costUsd = usage?.estimatedCostUsd ?? priced(call, usage);
      const summary = automationStudioLlmStepLogSummary.model(outcome.response, outcome.error);
      const finishedAt = Date.now();
      files.meta({
        step: folder.step, kind, startedAt: new Date(started).toISOString(), finishedAt: new Date(finishedAt).toISOString(), ms: finishedAt - started,
        provider: call.provider, model: call.model, url: call.url, requestId: call.requestId ?? null, attempt,
        taskKind: call.taskKind, stage: call.stage ?? null, iteration: call.iteration ?? null,
        part: scope?.part ?? null, round: scope?.round ?? null, phase: scope?.phase ?? automationStudioLlmStepLogNaming.phaseOfKind(kind),
        status: failure ? "error" : "ok", httpStatus: httpStatus ?? null,
        usage: usage ? { inputTokens: usage.inputTokens ?? null, outputTokens: usage.outputTokens ?? null, cacheHitInputTokens: usage.cacheHitInputTokens ?? null, cacheMissInputTokens: usage.cacheMissInputTokens ?? null } : null,
        costUsd: costUsd ?? null, finishReason: finishReason ?? null, error: failure ? { code: failure.code } : null, summary
      });
      automationStudioLlmStepLogListStep(directory, { step: folder.step, kind, tool: undefined, summary, costUsd });
    } catch {
      /* best-effort: a step that cannot be finished never fails the call */
    }
  };
  return {
    reply: (raw, status) => {
      try {
        httpStatus = status;
        files.text("response.json", raw);
        const read = automationStudioLlmStepLogResponseText(typeof raw === "string" ? raw : new TextDecoder("utf-8").decode(raw), status);
        envelope = read.envelope;
        finishReason = read.finishReason;
        files.text("response.txt", read.text);
      } catch {
        /* best-effort: an unrecorded reply never fails the call */
      }
    },
    succeeded: (response, usage) => finish({ response, usage }),
    failed: (error) => finish({ error })
  };
}

function requestText(call: AutomationStudioLlmStepLogModelCall): string {
  try {
    return automationStudioLlmStepLogRequestText({ url: call.url, body: call.body });
  } catch (error) {
    return `request.txt could not be rendered (${error instanceof Error ? error.name : "non_error"}); request.json holds the body.\n`;
  }
}

/** A failure's code, status and reply account (which malformed case, finish reason, length): never its message. */
function errorRecord(error: unknown): { code: string; name: string; status: number | null; retryable: boolean | null; reply: unknown } {
  const record = (typeof error === "object" && error !== null ? error : {}) as { code?: unknown; name?: unknown; status?: unknown; retryable?: unknown; reply?: unknown };
  return {
    code: typeof record.code === "string" ? record.code : "unknown",
    name: typeof record.name === "string" ? record.name : "non_error",
    status: typeof record.status === "number" ? record.status : null,
    retryable: typeof record.retryable === "boolean" ? record.retryable : null,
    reply: record.reply ?? null
  };
}

function replyUsage(error: unknown): AutomationStudioLlmStepLogUsage | undefined {
  const reply = (typeof error === "object" && error !== null ? (error as { reply?: unknown }).reply : undefined) as { usage?: unknown } | undefined;
  return typeof reply?.usage === "object" && reply.usage !== null ? reply.usage as AutomationStudioLlmStepLogUsage : undefined;
}

/**
 * What a failed call was still billed, when the provider error carries it as
 * `paid` (a reply that arrived and was refused after parsing): read duck-typed,
 * as `replyUsage` reads `reply`.
 */
function paidUsage(error: unknown): AutomationStudioLlmStepLogUsage | undefined {
  const paid = typeof error === "object" && error !== null ? (error as { paid?: unknown }).paid : undefined;
  if (typeof paid !== "object" || paid === null) return undefined;
  const raw = paid as Record<string, unknown>;
  const count = (value: unknown) => (typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined);
  const cost = typeof raw.estimatedCostUsd === "number" && Number.isFinite(raw.estimatedCostUsd) && raw.estimatedCostUsd >= 0 ? raw.estimatedCostUsd : undefined;
  return { inputTokens: count(raw.inputTokens), outputTokens: count(raw.outputTokens), cacheHitInputTokens: count(raw.cacheHitInputTokens), estimatedCostUsd: cost };
}

/** An OpenAI-shaped envelope's usage, for an adapter that does not parse it. */
function envelopeUsage(envelope: Record<string, unknown> | undefined): AutomationStudioLlmStepLogUsage | undefined {
  const usage = envelope?.usage;
  if (typeof usage !== "object" || usage === null) return undefined;
  const raw = usage as Record<string, unknown>;
  const count = (value: unknown) => (typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined);
  return { inputTokens: count(raw.prompt_tokens), outputTokens: count(raw.completion_tokens), cacheHitInputTokens: count(raw.prompt_cache_hit_tokens), cacheMissInputTokens: count(raw.prompt_cache_miss_tokens) };
}

function usageOf(usage: AutomationStudioLlmStepLogUsage | undefined): AutomationStudioLlmStepLogUsage | undefined {
  return usage && (usage.inputTokens !== undefined || usage.outputTokens !== undefined) ? usage : undefined;
}

function priced(call: AutomationStudioLlmStepLogModelCall, usage: AutomationStudioLlmStepLogUsage | undefined): number | undefined {
  if (!call.price || usage?.inputTokens === undefined || usage.outputTokens === undefined) return undefined;
  try {
    return call.price({ inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, cacheHitInputTokens: usage.cacheHitInputTokens ?? 0 });
  } catch (error) {
    // A usage the pricing refuses (a count out of range) is left unpriced; any other throw is a defect.
    if (error instanceof RangeError) return undefined;
    throw error;
  }
}
