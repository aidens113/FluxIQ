/** Core's finding that a later no's remedy would take back what an earlier standing no upheld (`./contradiction.ts`). */

export type ResultStandingNoContradiction = {
  /** The earlier revision whose standing no called rows not the asked kind. */
  revision: number;
  /** How many of those rows; never their labels. */
  rows: number;
  /** The later revision's conditions the no asks to remove, as lines name them. */
  conditions: string[];
  /** Core's words for the builder: what its record shows, naming no row. */
  said: string;
};
