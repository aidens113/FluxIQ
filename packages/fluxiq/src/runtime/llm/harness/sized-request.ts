// A call's request, built to the limits of the model that serves it and measured as that
// model will measure it (W3, t899).
//
// **The limits are the serving model's.** A run may give each role its own model
// (`../role-routing/`), and the provider a role is served by says its model's token
// limits (`./served-limits.ts`). Those, where said, replace the caller's: the caller
// passes the limits it resolved for its own model -- an attempt passes its explore
// model's -- and a judge with a smaller window was sent a request sized to the
// explorer's, which the judge's adapter refused by size. A provider that says none is
// held to the caller's limits, and the request is exactly what it was.
//
// **A result summary too large for them is sent in a shorter form its caller wrote.**
// The harness trims nothing. A caller that holds its result summary in shorter forms
// (`resultSummaryFitting`, each a Core-written summary of more of the evidence, saying
// what it summarised: `../../result-verification/flow-less/window-fitting.ts`) has the
// first of them that fits sent in its place, the whole one when it fits; where none
// fits, the shortest is refused by size, as any request over its window is.

import type { AutomationStudioLlmTokenLimits } from "../../models/limits/index.ts";
import { estimateAutomationStudioLlmTokensFromUtf8Bytes, resolveAutomationStudioLlmTokenLimits } from "../../models/limits/index.ts";
import type { AutomationStudioRunResultSummary } from "../../result-verification/index.ts";
import { automationStudioWithoutRunSecrets } from "../../run-secrets/index.ts";
import type { AutomationStudioLlmContextPacket, packAutomationStudioLlmContext } from "./context-packet.ts";
import type { AutomationStudioLlmProvider } from "./provider.ts";
import { automationStudioLlmServedTokenLimits } from "./served-limits.ts";
import type { AutomationStudioLlmHarnessInput, AutomationStudioLlmTaskRequest } from "./task-request.ts";

/** What the harness settled before the request is built: none of it depends on the request's size. */
type Settled = Pick<AutomationStudioLlmTaskRequest, "requestId" | "idempotencyKey" | "timeoutMs" | "expectedOutput" | "maxEstimatedCostUsd">;

export type AutomationStudioLlmSizedRequest = {
  context: AutomationStudioLlmContextPacket;
  /** Built with `estimatedInputTokens: 0`: the measure below is set on it by the harness. */
  request: AutomationStudioLlmTaskRequest;
  tokenLimitResolution: ReturnType<typeof resolveAutomationStudioLlmTokenLimits>;
  /** The provider that serves the request: the given one where it does not route. */
  served: AutomationStudioLlmProvider | undefined;
  measured: { estimatedInputTokens: number; estimatedInputBytes: number; pricedInputTokens: number };
};

/**
 * `pack` is the harness's own packer (`./context-packet.ts`), passed in rather than
 * imported: the packer's imports lead back to the harness barrel, and a module of the
 * harness that imported it would close that loop again.
 */
export function automationStudioLlmSizedRequest(input: AutomationStudioLlmHarnessInput, settled: Settled, pack: typeof packAutomationStudioLlmContext): AutomationStudioLlmSizedRequest {
  const build = (limits: Partial<AutomationStudioLlmTokenLimits> | undefined, resultSummary: AutomationStudioRunResultSummary | undefined) => {
    const tokenLimitResolution = resolveAutomationStudioLlmTokenLimits(limits);
    // A run's secret inputs are withheld from everything a model is sent, whatever carried them in: a page
    // or a tool result that echoed one, a draft step that ran with one (`../../run-secrets/`).
    const context = automationStudioWithoutRunSecrets(pack({
      ...input,
      ...(resultSummary ? { resultSummary } : {}),
      tokenBudget: tokenLimitResolution.limits.maxInputTokens
    }));
    const request: AutomationStudioLlmTaskRequest = {
      requestId: settled.requestId,
      idempotencyKey: settled.idempotencyKey,
      timeoutMs: settled.timeoutMs,
      estimatedInputTokens: 0,
      taskKind: input.taskKind,
      promptVersion: context.promptVersion,
      context,
      expectedOutput: settled.expectedOutput,
      tokenLimits: tokenLimitResolution.limits,
      maxEstimatedCostUsd: settled.maxEstimatedCostUsd,
      ...(input.dryRun ? { dryRun: true } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {})
    };
    return { tokenLimitResolution, context, request };
  };
  let built = build(input.tokenLimits, undefined);
  const served = input.provider?.servedBy?.(built.request) ?? input.provider;
  const own = automationStudioLlmServedTokenLimits(served);
  if (own) built = build(own, undefined);
  let measured = measuredInput(built.request, served);
  const limits = own ?? input.tokenLimits;
  for (const shorter of input.resultSummary !== undefined ? input.resultSummaryFitting ?? [] : []) {
    if (fits(measured.estimatedInputTokens, built.request.tokenLimits)) break;
    built = build(limits, shorter);
    measured = measuredInput(built.request, served);
  }
  return { ...built, served, measured };
}

/** Whether a request of `inputTokens` is inside `limits`: the harness's own two refusals by size, not met. */
function fits(inputTokens: number, limits: AutomationStudioLlmTokenLimits): boolean {
  return inputTokens <= limits.maxInputTokens && inputTokens + limits.maxOutputTokens <= limits.maxTotalTokens;
}

/**
 * The request's size and its price measure, by Core's one estimator.
 *
 * **Size** (`estimatedInputTokens`, `estimatedInputBytes`) and **price**
 * (`pricedInputTokens`) are one measure: the messages the provider will send,
 * which is what it reads, bills and refuses on, so the harness's
 * context-window refusal never passes a request the adapter's would refuse.
 * The packed request stands in only where the provider gives no measure, since
 * then nothing better is known. The packed request carries the full node
 * catalog where the provider sends names and the described nodes only: priced
 * as input it put about 30% on every build decision's hold (t254,
 * `reports/t254-purse-hold-investigation.md` in the extension repository), and
 * counted toward the window as the larger measure it refused requests whose
 * sent messages fit, whenever a node gained a parameter (t748). Catalog text
 * the provider does send -- names, described nodes, a one-shot build's whole
 * catalog -- is in its messages and counts.
 *
 * Both count UTF-8 bytes / 3 (`../token-estimation.ts`). That over-counts every
 * call observed: across 206 live calls on 2026-10-03 the densest was 3.24
 * bytes per token (median 3.72), so the price measure ran 1.08-1.32 times the
 * provider's reported input. It is not a proof -- text that tokenizes more
 * densely than 3 bytes a token would be under-counted, and the purse would
 * count the breach only after the call -- but no tokenizer is shipped (t254
 * P2, declined), and bytes / 3 has held on every call recorded.
 *
 * A provider's measure that throws, or is not whole numbers, is not a size; the
 * packed request stands for both and the provider refuses the request by its
 * own code.
 */
function measuredInput(request: AutomationStudioLlmTaskRequest, provider: AutomationStudioLlmProvider | undefined): { estimatedInputTokens: number; estimatedInputBytes: number; pricedInputTokens: number } {
  const packedBytes = Buffer.byteLength(JSON.stringify(request), "utf8");
  const packed = { estimatedInputTokens: estimateAutomationStudioLlmTokensFromUtf8Bytes(packedBytes), estimatedInputBytes: packedBytes };
  let sent: { estimatedInputTokens: number; estimatedInputBytes: number } | undefined;
  try {
    sent = provider?.measureInput?.(request);
  } catch {
    sent = undefined;
  }
  if (!sent || !Number.isSafeInteger(sent.estimatedInputTokens) || !Number.isSafeInteger(sent.estimatedInputBytes) || sent.estimatedInputTokens < 0) {
    return { ...packed, pricedInputTokens: packed.estimatedInputTokens };
  }
  return { estimatedInputTokens: sent.estimatedInputTokens, estimatedInputBytes: sent.estimatedInputBytes, pricedInputTokens: sent.estimatedInputTokens };
}
