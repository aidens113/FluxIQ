/**
 * One defect a `loop_verification` no names (t752): `kept_not_asked`, a row the
 * result keeps that the request does not ask for; `asked_missing`, a row the
 * request asks for that the result lacks (`row` may be "rows not read" for rows
 * the run never read); `wrong_value`, a kept row whose `column` holds a wrong
 * value; for an act the request asks for (t766), `act_missing`, an act the
 * request asks for that no step does (`row` names what it is done to), and
 * `act_wrong`, a step (`step`) that did its act to the wrong thing, with the
 * wrong value or with no effect the evidence shows; `other` names an ordering,
 * formatting, required column or other requirement that neither rows nor the
 * run's steps can measure, which remains unsure. `row` names the row as the
 * evidence does (Core's row id or its label); `requestWords` quotes the
 * request's words the row or act fails.
 */

export type LlmVerificationDefect = {
  kind: "kept_not_asked" | "asked_missing" | "wrong_value" | "act_missing" | "act_wrong" | "other";
  row: string;
  column?: string;
  /** The value the judge claims this stored cell holds, checked against Core's own stored cell. */
  value?: string;
  /** The step an `act_wrong` names, as the evidence names it: its node id, its label, or a build test's step number (t766). */
  step?: string;
  requestWords: string;
};
