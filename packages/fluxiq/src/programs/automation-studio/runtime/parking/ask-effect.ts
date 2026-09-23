import type { JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioAsk, AutomationStudioAskDraft, AutomationStudioAskKind, AutomationStudioAskOption, AutomationStudioAskRoutes } from "./ask.ts";

/**
 * The effect anything executing inside a run emits to ask the person something.
 *
 * An effect rather than a field on the node result, so the capability is open
 * to every part of a run at once: a built-in node, a domain adapter answering a
 * dispatch, a permission gate. The executor reads it where it reads the rest of
 * an attempt's effects, and never hands it to a host dispatcher -- no domain is
 * asked to know what an ask is.
 */
export const AUTOMATION_STUDIO_ASK_EFFECT = "ask.requested";

/** The effect for a drafted ask, ready to return from a node's `effects`. */
export function automationStudioAskEffect(draft: AutomationStudioAskDraft): { type: string; payload: JsonValue } {
  return { type: AUTOMATION_STUDIO_ASK_EFFECT, payload: draft as unknown as JsonValue };
}

/**
 * The ask an attempt raised, completed with the pending status and the account
 * of where it came from that only the runtime can supply. It keeps an id the
 * raiser gave it and is otherwise named after the attempt, which is unique
 * within the run.
 *
 * Returns nothing when no attempt effect is an ask, and nothing when the
 * payload is not one: a malformed payload must not park a run on a question
 * nobody can read, and an attempt that emitted rubbish is better carried on
 * from than stopped forever.
 */
export function automationStudioAskInEffects(
  effects: ReadonlyArray<{ type: string; payload?: JsonValue }>,
  raisedBy: AutomationStudioAsk["raisedBy"] & { askId: string }
): AutomationStudioAsk | undefined {
  const effect = effects.find((candidate) => candidate.type === AUTOMATION_STUDIO_ASK_EFFECT);
  if (!effect) return undefined;
  const draft = askDraft(effect.payload);
  if (!draft) return undefined;
  const { askId, ...origin } = raisedBy;
  return { ...draft, askId: draft.askId ?? askId, status: "pending", raisedBy: origin };
}

const ASK_KINDS: ReadonlySet<string> = new Set<AutomationStudioAskKind>(["permission", "choice", "confirm", "open"]);

function askDraft(payload: JsonValue | undefined): AutomationStudioAskDraft | undefined {
  if (!isRecord(payload)) return undefined;
  const { kind, parks, text } = payload;
  if (typeof kind !== "string" || !ASK_KINDS.has(kind)) return undefined;
  if (typeof parks !== "boolean" || typeof text !== "string" || !text.trim()) return undefined;
  const options = askOptions(payload.options);
  const routes = askRoutes(payload.routes);
  return {
    kind: kind as AutomationStudioAskKind,
    parks,
    text,
    ...(typeof payload.askId === "string" && payload.askId ? { askId: payload.askId } : {}),
    ...(options ? { options } : {}),
    ...(routes ? { routes } : {}),
    ...(typeof payload.timeoutMs === "number" && Number.isFinite(payload.timeoutMs) && payload.timeoutMs > 0 ? { timeoutMs: Math.floor(payload.timeoutMs) } : {}),
    ...(payload.onTimeout === "deny" || payload.onTimeout === "default" ? { onTimeout: payload.onTimeout } : {}),
    ...(Array.isArray(payload.missing) ? { missing: payload.missing.filter((entry): entry is string => typeof entry === "string") } : {}),
    ...(isRecord(payload.control) ? { control: askControl(payload.control) } : {}),
    ...(isRecord(payload.metadata) ? { metadata: payload.metadata } : {})
  };
}

function askOptions(value: JsonValue | undefined): AutomationStudioAskOption[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const options: AutomationStudioAskOption[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.value !== "string") continue;
    options.push({
      value: entry.value,
      label: typeof entry.label === "string" ? entry.label : entry.value,
      ...(typeof entry.route === "string" && entry.route ? { route: entry.route } : {})
    });
  }
  return options.length ? options : undefined;
}

function askRoutes(value: JsonValue | undefined): AutomationStudioAskRoutes | undefined {
  if (!isRecord(value)) return undefined;
  const { answered, denied, expired } = value;
  if (typeof answered !== "string" || typeof denied !== "string" || typeof expired !== "string") return undefined;
  if (!answered || !denied || !expired) return undefined;
  return { answered, denied, expired };
}

function askControl(value: Record<string, JsonValue>): NonNullable<AutomationStudioAsk["control"]> {
  return {
    ...(typeof value.name === "string" ? { name: value.name } : {}),
    ...(typeof value.kind === "string" ? { kind: value.kind } : {})
  };
}

function isRecord(value: JsonValue | undefined): value is Record<string, JsonValue> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
