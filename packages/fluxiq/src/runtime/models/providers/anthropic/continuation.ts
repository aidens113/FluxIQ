// A judge that continues the decider's own cached conversation (t965; user, 2026-11-19: "make sure the judge is
// utilizing caching that is already in there for all the decisions ... use the exact same thing ... then just append
// on the new data like prompt for the judge").
//
// **Why.** Live run `run-mwodpw10-3d5748ab`: the attempt's judge read a 211k-token trail uncached at $0.87 a check
// (0091, 0092), while the decider had just sent nearly all of it, cached. A cached read is a tenth of the price on
// Haiku 5.5 and a twentieth on Sonnet and Opus 5.5.
//
// **What is sent.** The decider's latest request, byte for byte, up to its last cache breakpoint: the same model,
// top-level fields, system blocks and output format, and the same user blocks up to that mark. Then, in the same user
// turn, the judge's own message with every trail entry whose call the decider's evidence above already holds left out
// and said so; then a mid-conversation system message with the judge's instructions, which keeps the cached prefix
// (`{role: "system"}`, accepted on Haiku, Sonnet and Opus 5.5). A cache belongs to its model, so the judge runs on the
// model that served that decision (`../../../llm/role-routing/provider.ts`).
//
// **The decider's output format, not the judge's.** A paid probe (t965, two calls on `claude-haiku-5-5`): the same
// system and user blocks with the judge's own `output_config.format` read 0 cached tokens and wrote all 9,707 again,
// the system prompt's included, so the format is part of the cached prefix. The decider's format is the adapter's
// JSON-text transport (`./schema.ts`, `result_json`), whose instruction says to put the object the user message's
// outputSchema asks for into `result_json`: the judge's message carries its own outputSchema, and its answer is read
// from `result_json` against it as any JSON-text answer is.

type TextBlock = { type: "text"; text: string; cache_control?: { type: "ephemeral" } };
type Message = { role: "user" | "system"; content: string | TextBlock[] };

/** What the adapter keeps of a decider's latest request: everything but its messages, and its user blocks up to the last mark. */
export type AutomationStudioAnthropicDeciderPrefix = {
  /** The request's top-level members in their order, `messages` kept in its place with no value. */
  wire: Record<string, unknown>;
  /** The user turn's blocks up to and including its last marked block. */
  blocks: TextBlock[];
  /** The ids of the calls whose evidence entries those blocks hold. */
  callIds: string[];
};

/** Said to the judge before its instructions: what the conversation above is, and what it does now. Generic: no site or task. */
const JUDGE_TURN = "The conversation above is the attempt's own record of deciding, up to its latest decision: the request, every call it made and what each call answered. Its decisions are over. You are now the check of what it got: answer the question the judge's message below asks, by the judge's instructions here, and put the JSON object the judge's outputSchema asks for into result_json.";

/** The prefix of a decider's request (`wire`, as it was sent), or none where it has no marked user blocks to share. */
export function automationStudioAnthropicDeciderPrefix(wire: Record<string, unknown>): AutomationStudioAnthropicDeciderPrefix | undefined {
  const messages = wire.messages as Message[] | undefined;
  const content = messages?.length === 1 && messages[0]!.role === "user" ? messages[0]!.content : undefined;
  if (!Array.isArray(content)) return undefined;
  const last = content.map((block) => block.cache_control !== undefined).lastIndexOf(true);
  if (last < 0) return undefined;
  const blocks = content.slice(0, last + 1);
  const callIds = blocks.slice(1).flatMap((block) => {
    try {
      const entry = JSON.parse(block.text.replace(/^,/u, "")) as { callId?: unknown };
      return typeof entry.callId === "string" ? [entry.callId] : [];
    } catch (error) {
      if (error instanceof SyntaxError) return []; // The head block and any block that is no whole entry name no call.
      throw error;
    }
  });
  return { wire: { ...wire, messages: undefined }, blocks, callIds };
}

/**
 * The judge's request as a continuation of `prefix`: its user message (`judgeUser`, the judge's JSON projection) with
 * the trail entries `prefix` already holds left out, after the decider's blocks; then its instructions (`judgeSystem`)
 * as a system message, every other member of the decider's request in its place.
 *
 * **Only this attempt's decider.** Which decider is the judge's own is its caller's to say -- the adapter holds a
 * decider's prefix under its attempt's key and gives it only to a judge of the same attempt (`../../../llm/anthropic/provider.ts`).
 * It is not read from the evidence: a decider's evidence also holds Core's own entries (where the page's state routed
 * the run, notes to the attempt, described nodes, a forward run), which are this attempt's history and no call of its
 * trail (run-mwohvt8n-a57cad8a, 0021/0022: five route-state entries, and every judge of the run fell back).
 */
export function automationStudioAnthropicJudgeContinuation(prefix: AutomationStudioAnthropicDeciderPrefix, judgeSystem: string, judgeUser: string): Record<string, unknown> {
  const payload = JSON.parse(judgeUser) as { context?: { resultSummary?: { trail?: { entries?: { callId?: unknown }[]; [key: string]: unknown } } } };
  const trail = payload.context?.resultSummary?.trail;
  if (trail && Array.isArray(trail.entries)) {
    const held = new Set(prefix.callIds);
    const shown = trail.entries.filter((entry) => typeof entry.callId !== "string" || !held.has(entry.callId));
    if (shown.length < trail.entries.length) trail.shownAbove = `${trail.entries.length - shown.length} of the attempt's calls are in its evidence above, each by the callId this trail gives, and are not repeated here.`;
    trail.entries = shown;
  }
  const messages: Message[] = [
    { role: "user", content: [...prefix.blocks, { type: "text", text: `\n\n${JSON.stringify(payload)}` }] },
    { role: "system", content: `${JUDGE_TURN}\n\n${judgeSystem}` }
  ];
  return { ...prefix.wire, messages };
}
