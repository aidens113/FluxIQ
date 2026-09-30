"use client";

// FluxIQ's words, formatted: paragraphs, lists, a heading, **bold** and
// `code`, drawn from plain data (`text/blocks.ts`), never from HTML. Plain
// words stay plain nodes, so a one-line message is just a paragraph.

import { Fragment } from "react";
import { conversationTextBlocks, type ConversationTextSpan } from "../text";

export function ConversationText(props: { text: string }) {
  const blocks = conversationTextBlocks(props.text);
  return (
    <div className="automation-conversation-text">
      {blocks.map((block, index) => {
        if (block.kind === "heading") return <p className="automation-conversation-text-heading" key={index}>{spans(block.spans)}</p>;
        if (block.kind === "list") {
          const items = block.items.map((item, at) => <li key={at}>{spans(item)}</li>);
          return block.ordered ? <ol key={index}>{items}</ol> : <ul key={index}>{items}</ul>;
        }
        if (block.lines.length === 1) return <p key={index}>{spans(block.lines[0]!)}</p>;
        return (
          <p key={index}>
            {block.lines.map((line, at) => (
              <Fragment key={at}>
                {at ? <br /> : null}
                {spans(line)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

/** A line's spans; a line of plain words is the string itself. */
function spans(line: readonly ConversationTextSpan[]) {
  if (line.length === 1 && line[0]!.kind === "text") return line[0]!.text;
  return line.map((span, index) => span.kind === "strong"
    ? <strong key={index}>{span.text}</strong>
    : span.kind === "code"
      ? <code key={index}>{span.text}</code>
      : <Fragment key={index}>{span.text}</Fragment>);
}
