import type { AutomationStudioResultNoWeighed } from "../refuted-no/index.ts";
import { CONTRADICTED, CONTRADICTED_ORDER, PART_CONTRADICTED } from "./contradicted-labels.ts";
import type { JudgeReading } from "./types.ts";

/** What a reading Core's record wholly refutes says of itself, after its call's number and before Core's findings. */
const WHOLLY = "contradicted by Core's record: ";

/**
 * A no's reading labelled with what Core's record refutes of it (header, t628),
 * as t501 labels a reading: its call and Core's findings, then its own words,
 * unchanged. Wholly refuted, it is "contradicted"; otherwise the label says the
 * record contradicts part of it, and the rest stands. `expected` restates the
 * request and is left as it is.
 */
export function refutedLabelled(reading: JudgeReading, refuted: { call: 1 | 2 } & AutomationStudioResultNoWeighed): JudgeReading {
  const label = refuted.wholly
    ? `Judge call ${refuted.call} (${WHOLLY}${refuted.findings.join(" ")})`
    : `Judge call ${refuted.call} (${PART_CONTRADICTED}: ${refuted.findings.join(" ")})`;
  return {
    ...reading,
    ...(reading.observed ? { observed: `${label}: ${reading.observed}` } : {}),
    ...(reading.advice ? { advice: `${label}: ${reading.advice}` } : {}),
    // The fact beside the label, for a gate to read (header, t641).
    recordContradicts: refuted.wholly ? "whole" : "part"
  };
}

// The advice a builder is shown of a judged trial (t687): each call's part as
// Core labelled it, less the advice of a reading Core's record wholly refutes.
//
// **Why.** A8 cost round `run-mvblov2i-abb7d82e`: a no's reading was labelled
// "contradicted by Core's record", and its advice -- drop a condition the
// request asks for -- still reached the builder beside it. The builder
// followed it, as it did the labelled readings of t641 and t652: a label beside
// an instruction does not stop the instruction. What the reading observed is
// still shown, with Core's findings, so the builder sees what was claimed and
// what Core's record says of it; the change it advised is not, and Core says in
// its place that it was left out and why.
//
// **What is read, and only that.** The advice as the agreement labelled it:
// one call's part after another, each `Judge call N (<label>): <advice>` or
// `Judge call N: <advice>` (`./both-readings.ts`, this file, and
// `../refuted-no/reask.ts` write them so). A part whose label is the wholly
// refuted one (`WHOLLY`, then Core's findings) is left out. Not the paging
// (t501) or order (t511) labels, which begin alike but say Core's record
// contradicts what the reading says of pages or order, never every claim it
// makes. Advice with no such label is one reading Core did not refute, shown as
// it is.

/** The start of each call's part of a labelled field. */
const CALL_PART = /Judge call [12](?: \(|: )/gu;
/** One call's part that carries a label, its call's number captured. */
const LABELLED_PART = /^Judge call ([12]) \(/u;

/** `advice` less each part of a reading Core's record wholly refutes, said in Core's words instead (above); as it is where it has none. */
export function automationStudioResultAdviceShown(advice: string | undefined): string | undefined {
  if (!advice) return advice;
  const starts = [...advice.matchAll(CALL_PART)].map((match) => match.index!);
  if (!starts.length) return advice;
  const parts = [advice.slice(0, starts[0]), ...starts.map((at, index) => advice.slice(at, starts[index + 1]))].map((part) => part.trim()).filter(Boolean);
  return parts.map((part) => withheld(part) ?? part).join(" ");
}

/** Core's words in place of a wholly refuted call's advice; nothing for any other part. */
function withheld(part: string): string | undefined {
  const call = LABELLED_PART.exec(part)?.[1];
  if (call === undefined) return undefined;
  const label = part.slice(`Judge call ${call} (`.length);
  if (!label.startsWith(WHOLLY) || label.startsWith(`${CONTRADICTED})`) || label.startsWith(`${CONTRADICTED_ORDER})`)) return undefined;
  return `Judge call ${call}'s advice is left out: Core's record contradicts every claim its reading makes, so the change it named rests on nothing the trial shows.`;
}
