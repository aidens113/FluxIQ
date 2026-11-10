"use client";

import Link from "next/link";
import type { StepView } from "../../model";

/** A step's words: text, `{input}` chips, the linked Flow of a "Run Flow ▸ Name" step, and its lasting badges. */
export function StepWords(props: { step: StepView }) {
  const { step } = props;
  return (
    <span className="flows-step-words" data-jump={step.jump || undefined}>
      {step.words.map((piece, index) => piece.kind === "text"
        ? <span key={index}>{piece.text}</span>
        : <span key={index} className="flows-chip" data-known={piece.known} title={piece.known ? "An input of this Flow" : "A value read from elsewhere"}>{`{${piece.name}}`}</span>)}
      {step.link ? (
        step.link.href
          ? <> <Link className="flows-step-link" href={step.link.href} aria-label={`Open the Flow ${step.link.name}`}>{step.link.name}</Link></>
          : <> <strong>{step.link.name}</strong></>
      ) : null}
      {step.badges.map((badge) => <span key={badge} className="flows-badge" data-badge={badge}>{badge}</span>)}
      {step.changed ? <span className="flows-badge" data-badge="changed">changed</span> : null}
    </span>
  );
}
