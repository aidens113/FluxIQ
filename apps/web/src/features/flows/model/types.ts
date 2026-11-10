// What the Flows screens draw, already in plain words. The components draw these and nothing else.

export type Tone = "ok" | "warn" | "bad" | "neutral";

/** A run of a step's words: plain text, or an input of the Flow shown as a `{chip}`. */
export type WordPiece = { kind: "text"; text: string } | { kind: "input"; name: string; known: boolean };

/** Where a "Run Flow ▸ Name" step goes: its name, and a link when the Flow opens in this editor. */
export type StepLink = { name: string; href?: string };

/** One step of the list as drawn. */
export type StepView = {
  /** Stable across a re-read of the same version: the node the step is about, else its place. */
  key: string;
  /** "3", "5.1"; empty for a heading such as "If something goes wrong:". */
  number: string;
  words: WordPiece[];
  /** The words as one string, for names read out by a screen reader. */
  plainWords: string;
  kind: string;
  /** "sends", "deletes", "pays", "changes", "creates". */
  badges: string[];
  /** A step the graph does not nest ("Go back to step 3"). */
  jump: boolean;
  link?: StepLink;
  /** A step that stands for a node of its own: its words, values and place can be changed. */
  editable: boolean;
  /** Changed by someone else since the person last read the Flow. */
  changed: boolean;
  nodeIds: string[];
  children: StepView[];
  arms: Array<{ words: string; steps: StepView[] }>;
};

/** One Flow in the list, with how its last run went when it has one. */
export type FlowRow = {
  flowId: string;
  name: string;
  description: string;
  href: string;
  lastRun?: { label: string; tone: Tone; ago: string; runHref: string };
};

/** The one line under the Flow's name that says whether it works as it stands. */
export type StatusLine = { tone: Tone; text: string };

/** One version in the history drawer. */
export type HistoryRow = {
  revisionNumber: number;
  title: string;
  who: string;
  why: string;
  when: string;
  current: boolean;
  /** The restore point to send; absent when this version cannot be put back. */
  snapshotSha256?: string;
};

/** One value of a step a person may change, at its path inside what the step is given. */
export type StepValue = {
  path: string[];
  label: string;
  /** The value as typed in the field; empty when it reads from an input. */
  text: string;
  kind: "text" | "number" | "yes-no";
  /** The Flow input it reads, when it is bound to one. */
  input?: string;
};
