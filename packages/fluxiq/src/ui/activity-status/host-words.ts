// The words a host -- the client drawing the activity status -- says when the
// work waits on the person. Where the person acts depends on the host: the
// web extension asks them to answer in its FluxIQ panel, while Core's own web
// panel *is* that panel, and saying "answer in the FluxIQ panel" inside it
// reads wrongly (t728 F1). So the shared headline never words a wait itself:
// each host passes its own, and the field is required so no host silently
// inherits another's phrasing.
//
// A pause ("Paused: your turn on the page") is the same in every host and
// stays in `headline.ts`.

/** A host's headlines for a wait on the person. */
export type ActivityHostWords = {
  /** Core waits for the person's answer to a question (`waiting_permission`). */
  readonly answer: string;
  /** A page asks for what only a person can give (a robot check, a code prompt). */
  readonly check: string;
};
