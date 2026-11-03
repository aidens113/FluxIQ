// The tab each plan step acts in, as the step door saw it at submission (t791 fix 2). A trial's step carries no control,
// only its node, so what a refusal or a note may offer it -- the refs read in its own tab, whether a call there can make a
// witness -- is looked up here by the node (its definition and its `<subflow>.<node>` key). Bounded; the latest ask of a
// node wins, since a resubmission may move a step to another control.

/** The most nodes kept: a build's plans are far smaller, and an older node is dropped first. */
const CAP = 1024;

/** What the step door saw of a node's control: its tab (absent when unknown), and whether it names any item, page or list. */
export type AutomationStudioSiteResetStepSeen = { resource?: string; identified: boolean };

export class AutomationStudioSiteResetStepResources {
  private readonly byNode = new Map<string, AutomationStudioSiteResetStepSeen>();

  /** The key a node is kept under. */
  static key(definitionId: string, ref: string): string {
    return `${definitionId}\0${ref}`;
  }

  /** Keeps what the step door saw of the node's control. */
  note(key: string, seen: AutomationStudioSiteResetStepSeen): void {
    this.byNode.delete(key);
    this.byNode.set(key, seen);
    if (this.byNode.size > CAP) this.byNode.delete(this.byNode.keys().next().value!);
  }

  /** What the step door saw of the node, or none where it was never asked about it. */
  of(key: string): AutomationStudioSiteResetStepSeen | undefined {
    return this.byNode.get(key);
  }
}
