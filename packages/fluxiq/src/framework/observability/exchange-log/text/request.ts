import { automationStudioLlmStepLogReadable } from "./readable.ts";

/** The body keys rendered in their own sections rather than under settings. */
const SECTIONED = new Set(["model", "messages", "tools", "response_format"]);

/**
 * `request.txt`: the exact body of `request.json`, laid out to be read. The
 * endpoint and model, the call's limits and settings, then every message in
 * order under `==== <n> <role> (<chars> chars) ====`, its content rendered
 * readable when it is JSON, then the tools and the response format. Never a
 * header: the credential travels in one, and none is ever given to the step log.
 */
export function automationStudioLlmStepLogRequestText(input: { url: string; body: string }): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.body) as unknown;
  } catch {
    /* best-effort: a body that is not JSON is shown as it was sent */
    return `POST ${input.url}\n\n==== body (${input.body.length} chars, not JSON) ====\n${input.body}\n`;
  }
  const body = isRecord(parsed) ? parsed : {};
  const out: string[] = [`POST ${input.url}`, `model: ${typeof body.model === "string" ? body.model : "-"}`];
  const settings = Object.fromEntries(Object.entries(body).filter(([key]) => !SECTIONED.has(key)));
  if (Object.keys(settings).length) out.push("limits and settings:", automationStudioLlmStepLogReadable(settings, "  "));
  const messages = Array.isArray(body.messages) ? body.messages : [];
  messages.forEach((message, index) => {
    const record: Record<string, unknown> = isRecord(message) ? message : { content: message };
    const content = record.content;
    const chars = typeof content === "string" ? content.length : JSON.stringify(content ?? null).length;
    out.push("", `==== ${index + 1} ${typeof record.role === "string" ? record.role : "-"} (${chars} chars) ====`, contentText(content));
    const rest = Object.fromEntries(Object.entries(record).filter(([key]) => key !== "role" && key !== "content"));
    if (Object.keys(rest).length) out.push("---- other fields ----", automationStudioLlmStepLogReadable(rest));
  });
  if (body.tools !== undefined) out.push("", "==== tools ====", automationStudioLlmStepLogReadable(body.tools));
  if (body.response_format !== undefined) out.push("", "==== response_format ====", automationStudioLlmStepLogReadable(body.response_format));
  return `${out.join("\n")}\n`;
}

/** A message's content: JSON in a string rendered readable, anything else as it is. */
function contentText(content: unknown): string {
  if (typeof content !== "string") return automationStudioLlmStepLogReadable(content);
  const trimmed = content.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return automationStudioLlmStepLogReadable(JSON.parse(trimmed) as unknown);
    } catch {
      /* best-effort: content that only looks like JSON is shown as written */
      return content;
    }
  }
  return content;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
