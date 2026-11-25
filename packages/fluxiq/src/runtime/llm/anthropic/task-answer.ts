// A reply read as the answer its task asked for, on the path where nothing else holds it to the schema.
//
// Under the JSON-text transport the provider sees one string, so a reply can be sound JSON and fit nothing. Core checks the
// unchanged schema here, and that check came before everything Core does to keep a paid answer rather than refuse it, which
// other providers reach first (`../deepseek/response-envelope.ts`). Run `run-mw3itjcy-ce4429f7` lost two calls that way: a
// judge's clear yes whose `observed` ran to 575 characters against a bound of 500 (the harness reads such a text whole,
// `../harness/provider-result.ts`, t665), and a sound decision under the wrong outer word. So, in order:
//
//   0. **A key one level too deep** moves up where the schema and the reply make it unambiguous (`automationStudioAnthropicReplyKeyUp`).
//   1. **The word no model can choose** is put right where the reply makes it unambiguous (`automationStudioAnthropicReplyOwnWord`).
//   2. **A decision is read as every provider's is** (`automationStudioLlmEvidenceNormalizedDecisionResponse`): the wrapper's
//      own name, a decision that came without its wrapper, a summary missing. A long summary is read whole, and the chat
//      shortens what it shows. What the decision may be is unchanged, and the harness still judges it.
//   3. **A decision is checked as Core reads it, against the variant it names** (`./decision-check.ts`, t1025): the one
//      reading the harness applies, and then the offered tool or kind the decision names, never the variant it came
//      nearest. A tool or kind the schema does not offer is the loop's to refuse by name, as for every provider.
//   4. **A length is no reason to refuse a judge's answer or a decision** (`maxLength`, `minLength`, `maxItems`). Core never
//      caps what a model wrote: the bound stays in the schema as what the model is told, and the harness and each tool's own
//      input check read past it, with their own codes. Other tasks keep every bound here, since this is all that holds them.
//   5. **What still does not fit is refused with its account**: which path and which constraint, never a word of the reply,
//      so the loop can tell the model what to change (`../unusable-decision.ts`). It was paid for either way.
//
// Native-schema requests take this path too. The provider's grammar relaxes what it cannot express into a description, so a
// length may be past there as well, and the same reading holds.
//
// So does a decision sent as tools (D12, t1038): its one tool call is read back into the same wrapper first
// (`../provider-task/decision-tools/`, `./provider.ts`), and every step above then applies to it unchanged, against the
// unchanged original schema -- a strict tool's grammar is never the authority either.

import { automationStudioAnthropicPaidFailure, automationStudioAnthropicReplyKeyUp, automationStudioAnthropicReplyOwnWord, automationStudioAnthropicSchemaMisses } from "../../models/providers/anthropic/index.ts";
import { automationStudioLlmEvidenceNormalizedDecisionResponse } from "../evidence-loop-decision.ts";
import type { AutomationStudioLlmStructuredResponse, AutomationStudioLlmTaskRequest, AutomationStudioLlmUsageSummary } from "../harness/index.ts";
import { automationStudioLlmTaskExpectedOutput, automationStudioLlmTaskOutputSchema } from "../provider-task/index.ts";
import { automationStudioAnthropicDecisionCheck } from "./decision-check.ts";

/** The answer a task's reply gives (header), or the paid failure saying where it does not fit. `contentChars` is how long the reply's text (or tool input) was; `finishReason`, why the reply stopped. */
export function automationStudioAnthropicTaskAnswer(structured: unknown, request: AutomationStudioLlmTaskRequest, usage: AutomationStudioLlmUsageSummary, contentChars: number, finishReason = "end_turn"): AutomationStudioLlmStructuredResponse {
  const schema = automationStudioLlmTaskOutputSchema(request);
  const decisionTask = request.taskKind === "evidence_tool_decision";
  const worded = automationStudioAnthropicReplyKeyUp(automationStudioAnthropicReplyOwnWord(structured, schema), schema);
  const answer = (decisionTask ? automationStudioLlmEvidenceNormalizedDecisionResponse(worded, Number.POSITIVE_INFINITY) : undefined) ?? worded;
  const lengths = !decisionTask && automationStudioLlmTaskExpectedOutput(request.taskKind) !== "diagnosis";
  const checked = decisionTask ? automationStudioAnthropicDecisionCheck(answer, schema) : { value: answer, schema };
  const misses = automationStudioAnthropicSchemaMisses(checked.value, checked.schema, { lengths });
  if (misses.length > 0) throw automationStudioAnthropicPaidFailure("llm.provider_output_invalid", usage, { case: "content_off_shape", finishReason, contentChars, usage, misses });
  // The reply goes on as it came, decision unread: the harness reads it the same way and says what it read, then applies its usual semantic result validation again before it can execute an answer.
  return answer as AutomationStudioLlmStructuredResponse;
}
