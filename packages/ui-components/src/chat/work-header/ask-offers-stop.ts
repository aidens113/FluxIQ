// Whether a question's own answers include Stop, as a person-only check's do. While one
// is on screen, the work header's Stop is put away, so there are never two buttons of
// that name a few pixels apart.

import { askPresentation, type CoreAsk } from "../conversation/index.ts";

/** True when pressing one of `ask`'s answers is pressing Stop. */
export function askOffersStop(ask: CoreAsk): boolean {
  const shown = askPresentation(ask);
  return shown.state === "choices" && shown.choices.some((choice) => choice.label === "Stop");
}
