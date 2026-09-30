// A turn's text, read as the few shapes FluxIQ writes: paragraphs, bullet and
// numbered lists, a heading line, **bold** and `code`.
//
// It is a reader, not a Markdown engine. Nothing becomes HTML: the result is
// plain data the turn draws with React elements, so text that looks like
// markup can never become markup. Anything this does not recognise stays the
// words it was.

export type ConversationTextSpan = { kind: "text" | "strong" | "code"; text: string };

export type ConversationTextBlock =
  | { kind: "paragraph"; lines: ConversationTextSpan[][] }
  | { kind: "heading"; spans: ConversationTextSpan[] }
  | { kind: "list"; ordered: boolean; items: ConversationTextSpan[][] };

const BULLET = /^\s*[-*•]\s+(.*)$/u;
const NUMBERED = /^\s*\d{1,3}[.)]\s+(.*)$/u;
const HEADING = /^\s*#{1,6}\s+(.*)$/u;
const INLINE = /\*\*([^*\n]+)\*\*|`([^`\n]+)`/gu;

export function conversationTextBlocks(text: string): ConversationTextBlock[] {
  const blocks: ConversationTextBlock[] = [];
  let paragraph: ConversationTextSpan[][] | null = null;
  let list: { ordered: boolean; items: ConversationTextSpan[][] } | null = null;
  const close = () => {
    paragraph = null;
    list = null;
  };
  for (const line of text.replace(/\r\n?/gu, "\n").split("\n")) {
    if (!line.trim()) {
      close();
      continue;
    }
    const heading = HEADING.exec(line);
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    if (heading) {
      close();
      blocks.push({ kind: "heading", spans: conversationTextSpans(heading[1]!) });
      continue;
    }
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      const item = conversationTextSpans((bullet ?? numbered)![1]!);
      paragraph = null;
      if (list && list.ordered === ordered) {
        list.items.push(item);
      } else {
        list = { ordered, items: [item] };
        blocks.push({ kind: "list", ...list });
      }
      continue;
    }
    list = null;
    if (paragraph) {
      paragraph.push(conversationTextSpans(line));
    } else {
      paragraph = [conversationTextSpans(line)];
      blocks.push({ kind: "paragraph", lines: paragraph });
    }
  }
  return blocks;
}

/** One line's inline spans: `code`, **bold**, and the words between them. */
export function conversationTextSpans(line: string): ConversationTextSpan[] {
  const spans: ConversationTextSpan[] = [];
  let at = 0;
  for (const match of line.matchAll(INLINE)) {
    if (match.index > at) spans.push({ kind: "text", text: line.slice(at, match.index) });
    spans.push(match[1] !== undefined ? { kind: "strong", text: match[1] } : { kind: "code", text: match[2]! });
    at = match.index + match[0].length;
  }
  if (at < line.length) spans.push({ kind: "text", text: line.slice(at) });
  return spans;
}
