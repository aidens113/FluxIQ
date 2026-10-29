/** A settable clock. */
export class TestClock {
  nowMs = 1_800_000_000_000;

  advance(ms: number): void {
    this.nowMs += ms;
  }
}
