import { describe, expect, it } from "vitest";
import { automationStudioAnthropicRequest } from "../request.ts";
import { automationStudioLlmTaskMessages } from "../../provider-task/index.ts";
import { decisionRequest } from "./fixtures.ts";

describe("Anthropic evidence prefix caching", () => {
  it("preserves the shared JSON payload and caches the append-only evidence prefix before varying context", () => {
    const first = decisionRequest();
    first.context.evidenceLoop!.evidence.push({ callId: "inspect.one", toolId: "core.inspect_values", value: { matched: [{ name: "Studio A", options: { ready: true } }] } });
    const second = structuredClone(first);
    second.context.evidenceLoop!.iteration = 2;
    second.context.evidenceLoop!.evidence.push({ callId: "inspect.two", toolId: "core.inspect_values", value: { matched: [{ name: "Studio B" }] } });
    const contents = [first, second].map((task) => {
      const wire = JSON.parse(automationStudioAnthropicRequest(task, "claude-sonnet-5-5").body);
      const content = wire.messages[0].content as Array<{ text: string; cache_control?: unknown }>;
      expect(content.map((block) => block.text).join("")).toBe(automationStudioLlmTaskMessages(task)[1]!.content);
      return content;
    });
    const cachedPrefix = contents[0]!.filter((_, index) => index < contents[0]!.length - 1).map((block) => block.text).join("");
    expect(contents[1]!.map((block) => block.text).join("").startsWith(cachedPrefix)).toBe(true);
    expect(contents[0]![1]).toHaveProperty("cache_control");
    expect(contents[1]![2]).toHaveProperty("cache_control");
    expect(contents[1]![1]).not.toHaveProperty("cache_control");
    expect(contents[1]!.at(-1)!.text).toContain('"iteration":2');
  });
});
