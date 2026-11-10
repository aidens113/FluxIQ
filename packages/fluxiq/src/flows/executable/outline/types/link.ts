/**
 * The Flow a "Run Flow" step runs, by the id that survives moves and renames:
 * a Flow of the project, a Subflow of this automation, a saved part, or a
 * FluxNode by its registered name.
 */
export type OutlineLink = { kind: "flow" | "subflow" | "part" | "fluxnode"; id: string };
