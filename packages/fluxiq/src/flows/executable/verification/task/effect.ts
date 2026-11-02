/** The change a part asks for (t775): `change`, a number of `what` added or removed; `end_state`, the state that holds once it is done. */

export type ResultTaskEffect =
  | { kind: "change"; direction: "adds" | "removes"; count: number | "each_match"; what: string }
  | { kind: "end_state"; state: string };
