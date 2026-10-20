// How this panel words a wait on the person in the shared activity headline
// (`ActivityHostWords` in `fluxiq/ui`). The shared module once said the web
// extension's words here too, "Waiting for you: answer in the FluxIQ panel",
// which reads wrongly inside the FluxIQ panel itself (t728 F1). A question is
// answered right here, so it is said as this chat said it before the pacer
// was shared; a check is finished on the site, which is open in the browser,
// not in this panel.

import type { ActivityHostWords } from "fluxiq/ui";

export const CONVERSATION_ACTIVITY_HOST_WORDS: ActivityHostWords = Object.freeze({
  answer: "Waiting for your answer",
  check: "Waiting for you: finish the check in your browser"
});
