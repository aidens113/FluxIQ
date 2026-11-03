// FluxIQ's words as blocks a person reads comfortably: paragraphs, lists,
// code, and inside them bold and inline code. No DOM, and no HTML: this reads
// the small Markdown subset Core's sentences use and nothing else, so a "<b>"
// in the text is the four characters "<b>", shown as they are.
//
//   blank line          ends a paragraph
//   "- ", "* ", "• "    a bulleted list item; "1. " or "1) " a numbered one
//   "# " to "###### "   a heading, shown as a bold paragraph
//   ``` fences          a code block, verbatim
//   **words**           bold
//   `words`             inline code
//   [label](target)     "label (target)", as text: the panel opens no links
//
// A bracket holding only Core's codes ("(flow_bootstrap.blank_target_required)")
// is left out of the text (`raw-codes.ts`); inline code is shown as written.
//
// A single line break inside a paragraph is kept, because Core writes one
// where it means one.

import { withoutRawCodes } from "./raw-codes.ts";

/** A run of text inside a block. */
export type TextRun = { kind: "text" | "strong" | "code"; text: string };

/** One block of an assistant turn. */
export type TextBlock =
  | { kind: "paragraph"; runs: TextRun[] }
  | { kind: "heading"; runs: TextRun[] }
  | { kind: "list"; ordered: boolean; start: number; items: TextRun[][] }
  | { kind: "code"; text: string };

const BULLET = /^\s{0,3}[-*•]\s+(.*)$/u;
const NUMBERED = /^\s{0,3}(\d{1,9})[.)]\s+(.*)$/u;
const HEADING = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/u;
const FENCE = /^\s{0,3}```/u;
const CONTINUATION = /^\s{2,}\S/u;

/** `text` as blocks. */
export function parseAssistantText(text: string): TextBlock[] {
  const lines = text.replace(/\r\n?/gu, "\n").split("\n");
  const blocks: TextBlock[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; start: number; items: string[] } | undefined;

  const endParagraph = (): void => {
    if (paragraph.length > 0) blocks.push({ kind: "paragraph", runs: parseRuns(paragraph.join("\n")) });
    paragraph = [];
  };
  const endList = (): void => {
    if (list !== undefined) blocks.push({ kind: "list", ordered: list.ordered, start: list.start, items: list.items.map(parseRuns) });
    list = undefined;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (FENCE.test(line)) {
      endParagraph();
      endList();
      const code: string[] = [];
      for (index += 1; index < lines.length && !FENCE.test(lines[index]!); index += 1) code.push(lines[index]!);
      blocks.push({ kind: "code", text: code.join("\n") });
      continue;
    }
    if (line.trim() === "") {
      endParagraph();
      endList();
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      endParagraph();
      endList();
      blocks.push({ kind: "heading", runs: parseRuns(heading[1]!) });
      continue;
    }
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    if (bullet || numbered) {
      endParagraph();
      const ordered = numbered !== null;
      if (list !== undefined && list.ordered !== ordered) endList();
      list ??= { ordered, start: numbered ? Number(numbered[1]) : 1, items: [] };
      list.items.push(bullet ? bullet[1]! : numbered![2]!);
      continue;
    }
    if (list !== undefined && CONTINUATION.test(line)) {
      list.items[list.items.length - 1] += `\n${line.trim()}`;
      continue;
    }
    endList();
    paragraph.push(line);
  }
  endParagraph();
  endList();
  return blocks;
}

/** The runs of one block's text: bold, inline code and links-as-text. */
export function parseRuns(text: string): TextRun[] {
  const runs: TextRun[] = [];
  const push = (kind: TextRun["kind"], value: string): void => {
    const last = runs[runs.length - 1];
    if (kind === "text" && last?.kind === "text") last.text += value;
    else if (value !== "") runs.push({ kind, text: value });
  };
  let index = 0;
  while (index < text.length) {
    const rest = text.slice(index);
    if (rest.startsWith("`")) {
      const end = text.indexOf("`", index + 1);
      if (end > index + 1) {
        push("code", text.slice(index + 1, end));
        index = end + 1;
        continue;
      }
    }
    if (rest.startsWith("**")) {
      const end = text.indexOf("**", index + 2);
      if (end > index + 2) {
        push("strong", text.slice(index + 2, end));
        index = end + 2;
        continue;
      }
    }
    if (rest.startsWith("[")) {
      const link = /^\[([^\]\n]+)\]\(([^)\s]+)\)/u.exec(rest);
      if (link) {
        const [whole, label, target] = link as unknown as [string, string, string];
        push("text", label === target ? label : `${label} (${target})`);
        index += whole.length;
        continue;
      }
    }
    push("text", text[index]!);
    index += 1;
  }
  return runs.flatMap((run) => {
    if (run.kind !== "text") return [run];
    const words = withoutRawCodes(run.text);
    return words === "" ? [] : [{ kind: "text" as const, text: words }];
  });
}
