/** Runs async tasks one after another within this process, whatever each one's outcome. */
export class SerialQueue {
  private tail: Promise<void> = Promise.resolve();

  async run<T>(task: () => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release: () => void = () => undefined;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await task();
    } finally {
      release();
    }
  }
}
