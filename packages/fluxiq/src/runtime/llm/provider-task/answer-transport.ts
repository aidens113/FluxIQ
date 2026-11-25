/**
 * How a task's answer is asked for. `json_object`, every provider's default: the system prompt asks for one JSON object
 * and the user message carries the `outputSchema` it must match. `decision_tools`, for an evidence decision whose
 * provider takes it as one native tool call (`./decision-tools/`, D12, t1038): the schema is in the tools, so the user
 * message carries no `outputSchema` and the system prompt asks for the call. The message's `context` is the same either
 * way. Any task other than an evidence decision keeps `json_object` whichever is asked.
 */
export type AutomationStudioLlmTaskAnswerTransport = "json_object" | "decision_tools";
