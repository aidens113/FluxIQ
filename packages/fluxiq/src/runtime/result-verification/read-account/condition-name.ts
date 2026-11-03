// How every line names one condition of a read: `condition N (wording)`, N its
// place in the step's authored `where` counting from 1 -- the `number` its
// account carries -- and the wording as the account says it, or `wording
// withheld` where none may be said (t574).
//
// **Why one name.** Live run `run-mv7vor5f-ea4d08b4`'s judges were shown three
// numberings of the same conditions: the account's unnumbered list, its
// witnesses' 0-based `conditionIndex`, and Core's own lines' "condition 2",
// counting from 1, with no wording beside it. They put the Plus condition's
// rows under the rating condition and argued from that. Core's lines, the
// builder's trial feedback and the judge's copy now all say this one name, and
// every account condition carries the number it says.

/** `condition N (wording)`: one condition, by its number and wording, as every line names it (header). */
export function automationStudioResultConditionName(number: number, wording: string | undefined): string {
  return `condition ${number} (${wording ?? "wording withheld"})`;
}
