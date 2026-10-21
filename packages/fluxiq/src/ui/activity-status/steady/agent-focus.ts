// Which agent the status line follows (t753). A project build's agents work at
// once under one unit of work, and their rows arrive interleaved: shown as
// they came, the line alternated between one builder's test and another's
// exploring, changing one to three times every three seconds in about half of
// the samples of round 5. The line follows one agent while it keeps working;
// another's rows take it over only once that agent has said nothing for
// `holdMs`, or when the line must change now (the work settles or waits on the
// person). Pure apart from the time it is handed.

export class AgentFocus {
  private key: string | undefined;
  private at = Number.NEGATIVE_INFINITY;

  constructor(private readonly holdMs: number) {}

  /** Whether a row of `key` may reach the line now; when it may, `key` is followed from now on. */
  admits(key: string, now: number, urgent: boolean): boolean {
    if (!urgent && this.key !== undefined && this.key !== key && now - this.at < this.holdMs) return false;
    this.key = key;
    this.at = now;
    return true;
  }

  /** When the followed agent will have been quiet for long enough to let another take over. */
  quietAt(): number {
    return this.at + this.holdMs;
  }

  /** Follows nobody: the work settled, so the next row is followed whoever says it. */
  release(): void {
    this.key = undefined;
    this.at = Number.NEGATIVE_INFINITY;
  }
}
