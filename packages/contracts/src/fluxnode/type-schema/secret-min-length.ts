// The shortest value a secret input takes. Core withholds every occurrence of a secret's text in what
// a model reads, in step files and in traces, so a secret of one to three characters would blank
// ordinary words and numbers wherever they appear; no real password or key is that short.

/** A secret input's value is at least this many characters (`format: "secret"`). */
export const JSON_TYPE_SECRET_MIN_LENGTH = 4;
