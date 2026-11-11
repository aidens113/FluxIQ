// The humanness control: one task's, Flow's or FluxNode's level from Fastest to Most
// human-like, over a host's own commit. `humanness.css` styles it (chat.css imports it).
export { createHumannessControl, type HumannessCommit, type HumannessControl, type HumannessControlOptions, type HumannessLevel } from "./humanness-control.ts";
export { humannessWords } from "./level-words.ts";
