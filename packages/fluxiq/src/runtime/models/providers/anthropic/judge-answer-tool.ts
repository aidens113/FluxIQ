// The tool a judge continuing the decider's conversation answers with (t1065).
//
// **Why a tool.** A judge that continues a decider sent as tools must send the decider's request as its cached prefix,
// tools and `tool_choice: auto` included: a changed tool list misses the whole cache, a changed `tool_choice` or an added
// output format misses the cached messages, and a forced choice (`any`, `tool`) is a 400 on Sonnet and Opus 5.5. Asked
// to answer in plain text instead, every one of live run `run-mwy3btww-31d32e0d`'s 7 continuing judges (Sonnet 5.5)
// failed to be read: 4 reasoned in prose before the object (`content_prefixed`), 3 called the decider's `complete` with
// placeholder input (`tool_call_unexpected`), and 6 of the 7 had said yes. So the judge gets an answer channel of its own
// that the conversation already holds: this tool is in every decider request sent as tools, from the first, so the tool
// list never changes and the cache holds; the judge is told to answer by calling it (`./continuation.ts`), and a
// decider that calls it is refused by name (`tool_call_check_only`).
//
// **Its input is the check's whole reply**, the Flow-less judge's outputSchema, which is the same for every check, so
// the tool is the same bytes in every request (`../../../llm/anthropic/request.ts`). The answer is read from this call
// alone and checked against the judge's unchanged schema as every answer is (`../../../llm/anthropic/task-answer.ts`).
// Generic words: no site, task or answer.
//
// **Last, so the decision tools keep their strictness.** Strict schemas share one budget per request (24 optional
// parameters, `./grammar.ts`), taken in the order offered (`./decision-tools-wire.ts`). Measured on that run's deciders
// (0032, 0059, 0129): their six strict tools use 23 of the 24, and this tool's schema, without its open `metadata` bag,
// would need 12. Offered first it would turn decision tools non-strict on every decision, so it goes last and is sent
// non-strict; an answer that does not fit is answered in the judge's conversation with where it parted from the schema.

/** The answer tool's name and description; its input schema is the judge's outputSchema, given where the tool is offered. */
export const AUTOMATION_STUDIO_ANTHROPIC_JUDGE_ANSWER_TOOL = Object.freeze({
  name: "core_check_answer",
  description: "The answer of the check of an attempt's result, and only that: called once by the check, when a system message asks it to judge, with its verdict, the JSON object its outputSchema asks for, as the whole input. It is never a decision: called while deciding, it is refused and does nothing."
});
