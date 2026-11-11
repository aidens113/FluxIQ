// A humanness level in a person's words, for the slider's spoken value
// ("40, more human-like") and anywhere else a level is said.

/** What `level` (0 to 100) does, in a few words: "fastest" at 0, "most human-like" at 100. */
export function humannessWords(level: number): string {
  if (level <= 0) return "fastest";
  if (level >= 100) return "most human-like";
  if (level < 30) return "a little human-like";
  if (level < 70) return "more human-like";
  return "very human-like";
}
