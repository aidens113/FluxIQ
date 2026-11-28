import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { claudeKeyFromEnvText, distinctCalls, requestFiles, withoutKey } from "../anthropic-contract-check.mjs";

test("reads CLAUDE_API_KEY from an env file's text and nothing else", () => {
  assert.equal(claudeKeyFromEnvText("OTHER=1\n# CLAUDE_API_KEY=commented\nexport CLAUDE_API_KEY=\"abc-123\"\n"), "abc-123");
  assert.equal(claudeKeyFromEnvText("CLAUDE_API_KEY=plain # a note\r\n"), "plain");
  assert.equal(claudeKeyFromEnvText("ANTHROPIC_API_KEY=not-this\n"), undefined);
});

test("blanks the key from anything said back", () => {
  assert.equal(withoutKey("bad key abc-123 here abc-123", "abc-123"), "bad key [key] here [key]");
});

test("sends the first request of each distinct call, small and unstreamed, and skips other providers", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-contract-check-"));
  try {
    const step = async (folder, meta, body) => {
      await mkdir(path.join(root, folder), { recursive: true });
      await writeFile(path.join(root, folder, "meta.json"), JSON.stringify(meta));
      await writeFile(path.join(root, folder, "request.json"), JSON.stringify(body));
    };
    const tools = [{ name: "complete", input_schema: { type: "object" }, strict: true }, { name: "other", input_schema: { type: "object" } }];
    const decide = { provider: "anthropic", url: "https://api.anthropic.com/v1/messages", taskKind: "evidence_tool_decision", role: "supervisor", phase: "explore" };
    await step("0001-decide", decide, { model: "claude-haiku-5-5", max_tokens: 128000, stream: true, tools, messages: [{ role: "user", content: "a" }] });
    await step("0002-decide", decide, { model: "claude-haiku-5-5", max_tokens: 128000, stream: true, tools, messages: [{ role: "user", content: "b" }] });
    await step("0003-decide", { ...decide, role: "builder" }, { model: "claude-haiku-5-5", max_tokens: 128000, stream: true, tools, messages: [{ role: "user", content: "c" }] });
    await step("0004-chat", { provider: "deepseek", url: "https://api.deepseek.com/chat/completions" }, { model: "deepseek-flash", messages: [] });
    const calls = distinctCalls(requestFiles(root));
    assert.equal(calls.length, 2);
    assert.deepEqual(calls.map((call) => call.body.messages[0].content), ["a", "c"]);
    assert.equal(calls[0].body.max_tokens, 16);
    assert.equal(calls[0].body.stream, false);
    assert.match(calls[0].label, /2 tools, 1 strict$/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
