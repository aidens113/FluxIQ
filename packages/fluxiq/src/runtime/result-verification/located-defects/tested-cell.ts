// The one tested value a left-out row is said with, as a cell (t771): a read
// that sent a row by its label and the value its condition tested says it
// `label — column: value` (`../read-account/alone-rows.ts`). What Core holds
// of such a row's cells where the read sent no record of them: the rows a no
// calls missing are held to it (`./row-cells.ts`), and so is the value a
// condition tested (`./tested-value-only.ts`, t785).

/** A left-out row's tested value said after its label (`../read-account/alone-rows.ts`): `label — column: value`. */
const SAID_VALUE = / — ([\p{L}\p{N}_.$@-]{1,64}): (.+)$/su;
/** What an empty tested value reads as (`../read-account/alone-rows.ts`). */
const NO_VALUE = "(no value)";

/** The one tested value a row is said with, as a cell; nothing where it is said by its label alone. */
export function automationStudioResultLeftOutTestedCell(said: string): Record<string, string> | undefined {
  const found = SAID_VALUE.exec(said);
  if (!found) return undefined;
  const value = found[2]!.trim();
  return { [found[1]!]: value === NO_VALUE ? "" : value };
}
