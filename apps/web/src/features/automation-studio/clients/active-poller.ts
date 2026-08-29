export type ActivePoller = {
  sync(): void;
  dispose(): void;
};

export function createActivePoller<TTimer>(options: {
  active(): boolean;
  run(): Promise<void>;
  schedule(callback: () => void, delayMs: number): TTimer;
  cancel(timer: TTimer): void;
  delayMs: number;
}): ActivePoller {
  let disposed = false;
  let running = false;
  let timer: TTimer | undefined;

  const clear = () => {
    if (timer !== undefined) options.cancel(timer);
    timer = undefined;
  };
  const poll = async () => {
    if (disposed || !options.active() || running) {
      if (!options.active()) clear();
      return;
    }
    running = true;
    try {
      await options.run();
    } finally {
      running = false;
      if (!disposed && options.active()) timer = options.schedule(() => void poll(), options.delayMs);
    }
  };
  return {
    sync() {
      clear();
      if (options.active()) void poll();
    },
    dispose() {
      disposed = true;
      clear();
    }
  };
}