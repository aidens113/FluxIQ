// chat.css is self-contained: every class the chat's views build is styled in
// it, or is named below as a hook with no style of its own (the Lab and the
// tests find elements by it); and every custom property it reads without a
// fallback is one tokens.css defines.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

const CHAT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TOKENS_CSS = join(CHAT_DIR, "..", "theme", "tokens.css");
const CHAT_CSS = join(CHAT_DIR, "chat.css");

/** Classes the views build that carry no rule of their own: structure for the Lab, the tests and the host. */
const UNSTYLED_HOOKS: readonly string[] = [
  "button",
  "chat-key-text",
  "chat-project",
  "chat-project-card",
  "chat-project-item",
  "chat-read-notice-text",
  "chat-read-retry",
  "composer-draft-review"
];

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "tests") {
        found.push(...sourceFiles(path));
      }
    } else if (entry.name.endsWith(".ts")) {
      found.push(path);
    }
  }
  return found;
}

/** The string literals of the expression that starts at `from`, up to its comma or closing brace. */
function literalsOfExpression(text: string, from: number): string[] {
  const literals: string[] = [];
  let index = from;
  while (index < text.length && text[index] !== "," && text[index] !== "}") {
    if (text[index] === "\"") {
      const end = text.indexOf("\"", index + 1);
      if (!/[!=]==\s*$/u.test(text.slice(from, index))) {
        literals.push(text.slice(index + 1, end));
      }
      index = end;
    }
    index += 1;
  }
  return literals;
}

function classesBuilt(text: string): string[] {
  const names: string[] = [];
  for (const match of text.matchAll(/className:/gu)) {
    for (const literal of literalsOfExpression(text, match.index + match[0].length)) {
      names.push(...literal.split(/\s+/u).filter(Boolean));
    }
  }
  for (const match of text.matchAll(/classList\.\w+\(([^)]*)\)/gu)) {
    for (const literal of match[1]!.matchAll(/"([^"]+)"/gu)) {
      names.push(literal[1]!);
    }
  }
  return names;
}

function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//gu, "");
}

test("every class the views build is styled in chat.css or is a named hook", () => {
  const css = withoutComments(readFileSync(CHAT_CSS, "utf8"));
  const styled = new Set([...css.matchAll(/\.([a-zA-Z_][\w-]*)/gu)].map((match) => match[1]!));
  const built = new Set<string>();
  for (const file of sourceFiles(CHAT_DIR)) {
    for (const name of classesBuilt(readFileSync(file, "utf8"))) {
      built.add(name);
    }
  }
  assert.ok(built.size > 40, `the scan found the chat's classes (${built.size})`);
  const missing = [...built].filter((name) => !styled.has(name) && !UNSTYLED_HOOKS.includes(name)).sort();
  assert.deepEqual(missing, [], "classes with neither a rule in chat.css nor an entry in UNSTYLED_HOOKS");
  const stale = UNSTYLED_HOOKS.filter((name) => styled.has(name) || !built.has(name));
  assert.deepEqual(stale, [], "hooks that are styled after all, or no longer built");
});

test("every custom property chat.css reads without a fallback is defined in tokens.css", () => {
  const css = withoutComments(readFileSync(CHAT_CSS, "utf8"));
  const tokens = withoutComments(readFileSync(TOKENS_CSS, "utf8"));
  const defined = new Set([...tokens.matchAll(/(--[\w-]+)\s*:/gu)].map((match) => match[1]!));
  const read = new Set([...css.matchAll(/var\(\s*(--[\w-]+)\s*\)/gu)].map((match) => match[1]!));
  assert.ok(read.size > 10, `the scan found the properties chat.css reads (${read.size})`);
  assert.deepEqual([...read].filter((name) => !defined.has(name)).sort(), []);
});

test("chat.css styles nothing outside .chat-panel but its own classes, and names no page element", () => {
  const css = withoutComments(readFileSync(CHAT_CSS, "utf8"));
  const rules = css.replace(/@media[^{]*\{/gu, "").replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/gu, "");
  const selectors = [...rules.matchAll(/(?:^|\})\s*([^{}]+)\{/gu)].map((match) => match[1]!.trim());
  const leaks = selectors.flatMap((list) => list.split(",")).map((selector) => selector.trim()).filter((selector) => /^(?:html|body|\*|:root|[a-z]+\b)/u.test(selector));
  assert.deepEqual(leaks, [], "bare element, html, body or universal selectors");
});
