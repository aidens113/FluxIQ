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
// **Held means held whole (t1044).** The decider's evidence shows a call's page and read members as
// `{"core.view_reference": {callId, group}}`, whose whole value is only in the `core.current_view` tail, and that tail
// comes after the last cache mark, so it is never in the prefix (`../../../llm/decision-context/current-view.ts`). Live
// run `run-mwvgjb8c-5a1f2ae3` (0042): the judge was told all 15 of the attempt's calls were "in its evidence above",
// while every one of their 29 view references resolved to nothing it was sent, so it saw none of the pages and only 3
// of a read's 15 rows. A call is held above only where every reference in its entry resolves within the prefix;
// otherwise its trail entry stays in the judge's message.
//
// **The decider's output format, not the judge's.** A paid probe (t965, two calls on `claude-haiku-5-5`): the same
// system and user blocks with the judge's own `output_config.format` read 0 cached tokens and wrote all 9,707 again,
// the system prompt's included, so the format is part of the cached prefix. The decider's format is the adapter's
// JSON-text transport (`./schema.ts`, `result_json`), whose instruction says to put the object the user message's
// outputSchema asks for into `result_json`: the judge's message carries its own outputSchema, and its answer is read
// from `result_json` against it as any JSON-text answer is.
//
// **A decider sent as tools (D12, t1038).** Its request has `tools` and `tool_choice` and no output format
// (`./decision-tools-wire.ts`), and the judge sends all three exactly so: the tools render first in the prefix, so a
// changed tool list misses everything, and a changed `tool_choice` or an added `output_config.format` misses the cached
// messages, which are nearly all of what the judge reads (the prompt-caching page, "What invalidates the cache"; the
// structured-outputs page: changing the format invalidates the conversation's cache). So the judge's answer cannot be a
// native grammar of its own here: it answers with the JSON object as plain text, calling no tool (the tool choice is
// `auto`), and Core reads it against the judge's own outputSchema and checks it as every answer is. A judge of its own
// (`standalone_after_unreadable`, or no decider held) still gets its native format.

type TextBlock = { type: "text"; text: string; cache_control?: { type: "ephemeral" } };
type Message = { role: "user" | "system"; content: string | TextBlock[] };

/** What the adapter keeps of a decider's latest request: everything but its messages, and its user blocks up to the last mark. */
export type AutomationStudioAnthropicDeciderPrefix = {
  /** The request's top-level members in their order, `messages` kept in its place with no value. */
  wire: Record<string, unknown>;
  /** The user turn's blocks up to and including its last marked block. */
  blocks: TextBlock[];
  /** The ids of the calls whose evidence entries those blocks hold whole: every view reference in the entry resolves within the blocks. */
  callIds: string[];
  /** Set where the decider was sent as tools: the judge then answers in plain text. Otherwise it answers in the decider's `result_json`. */
  afterTools?: true;
};

/** Said to the judge before its instructions: what the conversation above is, and what it does now. Generic: no site or task. */
const JUDGE_TURN = "The conversation above is the attempt's own record of deciding, up to its latest decision: the request, every call it made and what each call answered. Its decisions are over. You are now the check of what it got: answer the question the judge's message below asks, by the judge's instructions here, and put the JSON object the judge's outputSchema asks for into result_json.";
/** The same after a decider that answered with tool calls: the judge's answer is the object itself, and no tool is its answer. */
const JUDGE_TURN_AFTER_TOOLS = "The conversation above is the attempt's own record of deciding, up to its latest decision: the request, every call it made and what each call answered. Its decisions are over, and its tools are not for this answer: call none. You are now the check of what it got: answer the question the judge's message below asks, by the judge's instructions here, with only the JSON object the judge's outputSchema asks for, as your reply's text.";

/** The prefix of a decider's request (`wire`, as it was sent), or none where it has no marked user blocks to share. */
export function automationStudioAnthropicDeciderPrefix(wire: Record<string, unknown>): AutomationStudioAnthropicDeciderPrefix | undefined {
  const messages = wire.messages as Message[] | undefined;
  const content = messages?.length === 1 && messages[0]!.role === "user" ? messages[0]!.content : undefined;
  if (!Array.isArray(content)) return undefined;
  const last = content.map((block) => block.cache_control !== undefined).lastIndexOf(true);
  if (last < 0) return undefined;
  const blocks = content.slice(0, last + 1);
  const entries = blocks.slice(1).flatMap((block) => {
    try {
      const entry = JSON.parse(block.text.replace(/^,/u, "")) as { callId?: unknown; toolId?: unknown; value?: unknown };
      return typeof entry.callId === "string" ? [entry as { callId: string; toolId?: unknown; value?: unknown }] : [];
    } catch (error) {
      if (error instanceof SyntaxError) return []; // The head block and any block that is no whole entry name no call.
      throw error;
    }
  });
  // The view groups the prefix itself holds whole, by the call and group a reference names (header, t1044).
  const resolved = new Set(entries.flatMap((entry) => entry.toolId === CURRENT_VIEW && isObject(entry.value) && Array.isArray(entry.value.groups)
    ? entry.value.groups.flatMap((group) => isObject(group) && typeof group.callId === "string" && typeof group.group === "string" ? [referenceKey(group.callId, group.group)] : [])
    : []));
  const callIds = entries.filter((entry) => viewReferences(entry.value).every((key) => resolved.has(key))).map((entry) => entry.callId);
  return { wire: { ...wire, messages: undefined }, blocks, callIds, ...(Array.isArray(wire.tools) ? { afterTools: true as const } : {}) };
}

/** The decider's tail entry holding each view group's latest whole value (`../../../llm/decision-context/current-view.ts`). */
const CURRENT_VIEW = "core.current_view";
/** The member that stands in for a view held elsewhere, `{"core.view_reference": {callId, group}}`. */
const VIEW_REFERENCE = "core.view_reference";

/** Every view reference in `value`, by its call and group; one that names neither counts as unresolvable. */
function viewReferences(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(viewReferences);
  if (!isObject(value)) return [];
  if (Object.hasOwn(value, VIEW_REFERENCE)) {
    const reference = value[VIEW_REFERENCE];
    return [isObject(reference) && typeof reference.callId === "string" && typeof reference.group === "string" ? referenceKey(reference.callId, reference.group) : "\u0000unnamed"];
  }
  return Object.values(value).flatMap(viewReferences);
}

function referenceKey(callId: string, group: string): string {
  return `${callId}\u0000${group}`;
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
  const payload = JSON.parse(judgeUser) as { context?: { resultSummary?: { trail?: { entries?: TrailEntry[]; [key: string]: unknown } } } };
  const trail = payload.context?.resultSummary?.trail;
  if (trail && Array.isArray(trail.entries)) {
    const held = new Set(prefix.callIds);
    const shown = trail.entries.filter((entry) => typeof entry.callId !== "string" || !held.has(entry.callId));
    if (shown.length < trail.entries.length) trail.shownAbove = `${trail.entries.length - shown.length} of the attempt's calls are in its evidence above, each by the callId this trail gives, and are not repeated here.`;
    trail.entries = withLeftOutValuesRestored(trail.entries, shown);
  }
  const messages: Message[] = [
    { role: "user", content: [...prefix.blocks, { type: "text", text: `\n\n${JSON.stringify(payload)}` }] },
    { role: "system", content: `${prefix.afterTools ? JUDGE_TURN_AFTER_TOOLS : JUDGE_TURN}\n\n${judgeSystem}` }
  ];
  return { ...prefix.wire, messages };
}

type TrailEntry = { callId?: unknown; n?: unknown; found?: unknown };

/**
 * `shown` with every `{ sameAs }` that names an entry left out of it given that entry's value back (t978). The trail shows
 * a repeated page view once and refers to its first holder (`../../../result-verification/run-trail/repeats.ts`); a holder
 * left out because the decider's evidence above holds its call is not there with its page views (the decider carries a
 * compact current view, not the trail's: run-mwoxglkg-e37fd49b held none of 31), so the first entry that refers to it
 * carries the value whole and later references name that entry instead. Nothing the judge is shown is lost.
 */
function withLeftOutValuesRestored(all: readonly TrailEntry[], shown: TrailEntry[]): TrailEntry[] {
  const kept = new Set(shown);
  const leftOut = new Map<string, Record<string, unknown>>();
  for (const entry of all) {
    if (kept.has(entry) || !isObject(entry.found)) continue;
    if (typeof entry.callId === "string") leftOut.set(entry.callId, entry.found);
    if (typeof entry.n === "number") leftOut.set(`n:${entry.n}`, entry.found);
  }
  if (leftOut.size === 0) return shown;
  const movedTo = new Map<string, string>();
  return shown.map((entry) => {
    if (!isObject(entry.found)) return entry;
    const holder = typeof entry.callId === "string" ? entry.callId : `n:${String(entry.n)}`;
    let changed = false;
    const found: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(entry.found)) {
      const target = isObject(value) && Object.keys(value).length === 1 && typeof value.sameAs === "string" ? value.sameAs : undefined;
      const original = target === undefined ? undefined : leftOut.get(target)?.[name];
      if (target === undefined || original === undefined) {
        found[name] = value;
        continue;
      }
      const key = `${name}\u0000${target}`;
      const moved = movedTo.get(key);
      if (moved === undefined) movedTo.set(key, holder);
      found[name] = moved === undefined ? original : { sameAs: moved };
      changed = true;
    }
    return changed ? { ...entry, found } : entry;
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
